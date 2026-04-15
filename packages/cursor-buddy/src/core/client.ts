import type { PointToolInput } from "../shared/point-tool"
import { $audioLevel, $conversationHistory, $isEnabled } from "./atoms"
import { AudioPlaybackService } from "./services/audio-playback"
import { BrowserSpeechService } from "./services/browser-speech"
import { LiveTranscriptionService } from "./services/live-transcription"
import { PointerController } from "./services/pointer-controller"
import { ScreenCaptureService } from "./services/screen-capture"
import {
  type SpeechPlaybackTask,
  TTSPlaybackQueue,
} from "./services/tts-playback-queue"
import { VoiceCaptureService } from "./services/voice-capture"
import { createStateMachine, type StateMachine } from "./state-machine"
import type {
  AnnotatedScreenshotResult,
  AudioPlaybackPort,
  BrowserSpeechPort,
  ConversationMessage,
  CursorBuddyClientOptions,
  CursorBuddyMediaMode,
  CursorBuddyServices,
  CursorBuddySnapshot,
  LiveTranscriptionPort,
  PointerControllerPort,
  PointingTarget,
  ScreenCapturePort,
  VoiceCapturePort,
} from "./types"
import { resolveMarkerToCoordinates } from "./utils/elements"
import { toError } from "./utils/error"
import { ProgressiveResponseProcessor } from "./utils/response-processor"

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

async function readErrorMessage(
  response: Response,
  fallbackMessage: string,
): Promise<string> {
  try {
    // Prefer structured JSON errors from our handlers, but degrade gracefully
    // to plain text if the route returns a different payload.
    const contentType = response.headers.get("Content-Type") ?? ""

    if (contentType.includes("application/json")) {
      const body = (await response.json()) as { error?: string }
      if (body?.error) return body.error
    }

    const text = await response.text()
    if (text) return text
  } catch {
    // Fall back to the generic message when the response body cannot be read.
  }

  return fallbackMessage
}

/**
 * Map coordinate-based pointing from screenshot space to viewport space.
 */
function mapCoordinatesToViewport(
  x: number,
  y: number,
  screenshot: AnnotatedScreenshotResult,
): { x: number; y: number } {
  if (screenshot.width <= 0 || screenshot.height <= 0) {
    return { x, y }
  }

  const scaleX = screenshot.viewportWidth / screenshot.width
  const scaleY = screenshot.viewportHeight / screenshot.height

  return {
    x: clamp(
      Math.round(x * scaleX),
      0,
      Math.max(screenshot.viewportWidth - 1, 0),
    ),
    y: clamp(
      Math.round(y * scaleY),
      0,
      Math.max(screenshot.viewportHeight - 1, 0),
    ),
  }
}

export type { CursorBuddyServices } from "./types"

/**
 * Framework-agnostic client for cursor buddy voice interactions.
 *
 * Manages the complete voice interaction flow:
 * idle -> listening -> processing -> responding -> idle
 *
 * Supports interruption: pressing hotkey during any state aborts
 * in-flight work and immediately transitions to listening.
 */
export class CursorBuddyClient {
  private endpoint: string
  private options: CursorBuddyClientOptions

  // Services
  private voiceCapture: VoiceCapturePort
  private audioPlayback: AudioPlaybackPort
  private browserSpeech: BrowserSpeechPort
  private liveTranscription: LiveTranscriptionPort
  private screenCapture: ScreenCapturePort
  private pointerController: PointerControllerPort
  private stateMachine: StateMachine

  // State
  private liveTranscript = ""
  private transcript = ""
  private response = ""
  private error: Error | null = null
  private abortController: AbortController | null = null
  private historyCommittedForTurn = false
  private speechProviderForTurn: "browser" | "server" | null = null
  private screenshotPromise: Promise<AnnotatedScreenshotResult> | null = null

  // Cached snapshot for useSyncExternalStore (must be referentially stable)
  private cachedSnapshot: CursorBuddySnapshot

  // Subscriptions
  private listeners = new Set<() => void>()

  constructor(
    endpoint: string,
    options: CursorBuddyClientOptions = {},
    services: CursorBuddyServices = {},
  ) {
    this.endpoint = endpoint
    this.options = options

    // Initialize services (allow injection for testing)
    this.voiceCapture = services.voiceCapture ?? new VoiceCaptureService()
    this.audioPlayback = services.audioPlayback ?? new AudioPlaybackService()
    this.browserSpeech = services.browserSpeech ?? new BrowserSpeechService()
    this.liveTranscription =
      services.liveTranscription ?? new LiveTranscriptionService()
    this.screenCapture = services.screenCapture ?? new ScreenCaptureService()
    this.pointerController =
      services.pointerController ?? new PointerController()
    this.stateMachine = createStateMachine()

    // Initialize cached snapshot
    this.cachedSnapshot = this.buildSnapshot()

    // Wire up audio level to atom
    this.voiceCapture.onLevel((level) => $audioLevel.set(level))
    this.liveTranscription.onPartial((text) => {
      if (this.liveTranscript === text) return
      this.liveTranscript = text
      this.notify()
    })

    // Wire up state machine changes
    this.stateMachine.subscribe(() => {
      this.options.onStateChange?.(this.stateMachine.getState())
      this.notify()
    })

    // Wire up pointer controller
    this.pointerController.subscribe(() => this.notify())
  }

  // === Public API ===

  /**
   * Start listening for voice input.
   * Aborts any in-flight work from previous session.
   */
  startListening(): void {
    // 1. Abort previous session synchronously
    this.abort()

    // 2. Clear UI state immediately
    this.liveTranscript = ""
    this.transcript = ""
    this.response = ""
    this.error = null
    this.historyCommittedForTurn = false
    this.speechProviderForTurn = null
    this.pointerController.release()

    // 3. Transition state
    this.stateMachine.transition({ type: "HOTKEY_PRESSED" })
    this.notify()

    // 4. Start mic (async, errors go to error state)
    this.abortController = new AbortController()
    const signal = this.abortController.signal

    // 5. Screenshot is captured in parallel with voice input to reduce latency
    this.screenshotPromise = this.screenCapture.captureAnnotated()

    // 6. Start mic (async, errors go to error state)
    this.beginListeningSession(signal).catch((error) => {
      if (signal.aborted) return

      this.voiceCapture.dispose()
      this.liveTranscription.dispose()
      this.handleError(toError(error, "Failed to start listening"))
    })
  }

  /**
   * Stop listening and process the voice input.
   */
  async stopListening(): Promise<void> {
    if (this.stateMachine.getState() !== "listening") return

    this.stateMachine.transition({ type: "HOTKEY_RELEASED" })
    const signal = this.abortController?.signal
    let turnFailure: Error | null = null

    const failTurn = (error: Error) => {
      if (turnFailure || signal?.aborted) return

      turnFailure = error
      this.audioPlayback.stop()
      this.browserSpeech.stop()
      this.abortController?.abort()
    }

    try {
      const [audioBlob, browserTranscript] = await Promise.all([
        this.voiceCapture.stop(),
        this.stopLiveTranscription(),
      ])

      let screenshot: AnnotatedScreenshotResult
      try {
        if (!this.screenshotPromise) {
          throw new Error("Screenshot was not started")
        }
        screenshot = await this.screenshotPromise
      } catch (screenshotError) {
        const errorMessage =
          screenshotError instanceof Error
            ? `Failed to capture screenshot: ${screenshotError.message}`
            : "Failed to capture screenshot"
        throw new Error(errorMessage)
      }

      if (turnFailure) throw turnFailure
      if (signal?.aborted) return

      // Resolve transcript from browser or server fallback
      const transcript = await this.resolveTranscript(
        browserTranscript,
        audioBlob,
        signal,
      )
      if (turnFailure) throw turnFailure
      if (signal?.aborted) return

      this.liveTranscript = ""
      this.transcript = transcript
      this.options.onTranscript?.(transcript)
      this.notify()

      this.prepareSpeechMode()

      // Chat stream + progressive sentence TTS
      const { cleanResponse, pointToolCall, playbackQueue } =
        await this.chatAndSpeak(transcript, screenshot, signal, {
          onFailure: failTurn,
          onPlaybackStart: () => {
            this.stateMachine.transition({ type: "RESPONSE_STARTED" })
          },
        })

      if (turnFailure) throw turnFailure
      if (signal?.aborted) return

      this.options.onResponse?.(cleanResponse)

      // Resolve pointing target from tool call (marker-based or coordinate-based)
      let pointTarget: PointingTarget | null = null

      if (pointToolCall) {
        if (pointToolCall.type === "marker") {
          // Resolve marker ID to element coordinates
          const coords = resolveMarkerToCoordinates(
            screenshot.markerMap,
            pointToolCall.markerId!,
          )
          if (coords) {
            pointTarget = { ...coords, label: pointToolCall.label }
          }
        } else {
          // Map coordinates from screenshot space to viewport space
          const coords = mapCoordinatesToViewport(
            pointToolCall.x!,
            pointToolCall.y!,
            screenshot,
          )
          pointTarget = { ...coords, label: pointToolCall.label }
        }
      }

      // Point if we have a valid target
      if (pointTarget) {
        this.options.onPoint?.(pointTarget)
        this.pointerController.pointAt(pointTarget)
      }

      await playbackQueue.waitForCompletion()

      if (turnFailure) throw turnFailure
      if (signal?.aborted) return

      // Update history only after audio playback succeeds for the full turn
      const history = $conversationHistory.get()
      const newHistory: ConversationMessage[] = [
        ...history,
        { role: "user", content: transcript },
        { role: "assistant", content: cleanResponse },
      ]
      $conversationHistory.set(newHistory)
      this.historyCommittedForTurn = true

      this.stateMachine.transition({ type: "TTS_COMPLETE" })
    } catch (err) {
      if (turnFailure) {
        this.handleError(turnFailure)
        return
      }
      // Interruption is not an error
      if (signal?.aborted) return
      this.handleError(toError(err))
    }
  }

  /**
   * Enable or disable the buddy.
   */
  setEnabled(enabled: boolean): void {
    $isEnabled.set(enabled)
    this.notify()
  }

  /**
   * Manually point at coordinates.
   */
  pointAt(x: number, y: number, label: string): void {
    this.pointerController.pointAt({ x, y, label })
  }

  /**
   * Dismiss the current pointing target.
   */
  dismissPointing(): void {
    this.pointerController.release()
  }

  /**
   * Reset to idle state and stop any in-progress work.
   */
  reset(): void {
    this.abort()
    this.liveTranscript = ""
    this.transcript = ""
    this.response = ""
    this.error = null
    this.historyCommittedForTurn = false
    this.pointerController.release()
    this.stateMachine.reset()
    this.notify()
  }

  /**
   * Update buddy position to follow cursor.
   * Call this on cursor position changes.
   */
  updateCursorPosition(): void {
    this.pointerController.updateFollowPosition()
  }

  /**
   * Subscribe to state changes.
   */
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  /**
   * Get current state snapshot for React's useSyncExternalStore.
   * Returns a cached object to ensure referential stability.
   */
  getSnapshot(): CursorBuddySnapshot {
    return this.cachedSnapshot
  }

  /**
   * Build a new snapshot object.
   */
  private buildSnapshot(): CursorBuddySnapshot {
    return {
      state: this.stateMachine.getState(),
      liveTranscript: this.liveTranscript,
      transcript: this.transcript,
      response: this.response,
      error: this.error,
      isPointing: this.pointerController.isPointing(),
      isEnabled: $isEnabled.get(),
    }
  }

  // === Private Methods ===

  private abort(): void {
    // Commit partial turn to history if interrupted mid-turn
    this.commitPartialHistory()

    this.abortController?.abort()
    this.abortController = null
    this.screenshotPromise = null
    this.voiceCapture.dispose()
    this.liveTranscription.dispose()
    this.audioPlayback.stop()
    this.browserSpeech.stop()
    this.speechProviderForTurn = null
    // Reset audio level on abort
    $audioLevel.set(0)
  }

  /**
   * Commit partial turn to history when interrupted.
   * Only commits if we have both transcript and response,
   * and haven't already committed for this turn.
   */
  private commitPartialHistory(): void {
    if (this.historyCommittedForTurn) return
    if (!this.transcript || !this.response) return

    const history = $conversationHistory.get()
    const newHistory: ConversationMessage[] = [
      ...history,
      { role: "user", content: this.transcript },
      { role: "assistant", content: this.response }, // already stripped of POINT tags
    ]
    $conversationHistory.set(newHistory)
    this.historyCommittedForTurn = true
  }

  private async transcribe(blob: Blob, signal?: AbortSignal): Promise<string> {
    const formData = new FormData()
    formData.append("audio", blob, "recording.wav")

    const response = await fetch(`${this.endpoint}/transcribe`, {
      method: "POST",
      body: formData,
      signal,
    })

    if (!response.ok) {
      throw new Error(await readErrorMessage(response, "Transcription failed"))
    }

    const { text } = await response.json()
    return text
  }

  /**
   * Stream the chat response, keep the visible text updated, and feed complete
   * speech segments into the TTS queue as soon as they are ready.
   */
  private async chatAndSpeak(
    transcript: string,
    screenshot: AnnotatedScreenshotResult,
    signal: AbortSignal | undefined,
    options: {
      onFailure: (error: Error) => void
      onPlaybackStart: () => void
    },
  ): Promise<{
    cleanResponse: string
    pointToolCall: PointToolInput | null
    playbackQueue: TTSPlaybackQueue
  }> {
    const history = $conversationHistory.get()

    const response = await fetch(`${this.endpoint}/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        screenshot: screenshot.imageData,
        capture: {
          width: screenshot.width,
          height: screenshot.height,
        },
        transcript,
        history,
        markerContext: screenshot.markerContext,
      }),
      signal,
    })

    if (!response.ok) {
      throw new Error("Chat request failed")
    }

    const reader = response.body?.getReader()
    if (!reader) throw new Error("No response body")

    const decoder = new TextDecoder()
    const responseProcessor = new ProgressiveResponseProcessor()
    const playbackQueue = new TTSPlaybackQueue({
      onError: options.onFailure,
      onPlaybackStart: options.onPlaybackStart,
      prepare: (text, currentSignal) =>
        this.prepareSpeechSegment(text, currentSignal),
      signal,
    })
    const shouldStreamSpeech = this.isSpeechStreamingEnabled()

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      const chunk = decoder.decode(value, { stream: true })
      const { speechSegments, visibleText } = responseProcessor.push(chunk)

      if (shouldStreamSpeech) {
        // Queue speech as early as possible, but keep playback ordered so the
        // spoken response stays aligned with the streamed text.
        for (const speechSegment of speechSegments) {
          playbackQueue.enqueue(speechSegment)
        }
      }

      this.updateResponse(visibleText)
    }

    const trailingChunk = decoder.decode()
    if (trailingChunk) {
      const { speechSegments, visibleText } =
        responseProcessor.push(trailingChunk)

      if (shouldStreamSpeech) {
        for (const speechSegment of speechSegments) {
          playbackQueue.enqueue(speechSegment)
        }
      }

      this.updateResponse(visibleText)
    }

    const finalizedResponse = responseProcessor.finish()

    if (shouldStreamSpeech) {
      for (const speechSegment of finalizedResponse.speechSegments) {
        playbackQueue.enqueue(speechSegment)
      }
    } else {
      playbackQueue.enqueue(finalizedResponse.finalResponseText)
    }

    this.updateResponse(finalizedResponse.finalResponseText)

    return {
      cleanResponse: finalizedResponse.finalResponseText,
      pointToolCall: finalizedResponse.pointToolCall,
      playbackQueue,
    }
  }

  /**
   * Request server-side TTS audio for one text segment.
   */
  private async synthesizeSpeech(
    text: string,
    signal?: AbortSignal,
  ): Promise<Blob> {
    const response = await fetch(`${this.endpoint}/tts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
      signal,
    })

    if (!response.ok) {
      throw new Error(await readErrorMessage(response, "TTS request failed"))
    }

    return response.blob()
  }

  /**
   * Resolve the initial speech provider for this turn.
   *
   * Decision tree:
   * 1. In `server` mode, always synthesize on the server.
   * 2. In `browser` mode, require browser speech support up front.
   * 3. In `auto` mode, prefer browser speech when available and keep that
   *    choice cached so later segments stay on the same provider unless a
   *    browser failure forces a one-way fallback to the server.
   */
  private prepareSpeechMode(): void {
    const speechMode = this.getSpeechMode()

    if (speechMode === "browser" && !this.browserSpeech.isAvailable()) {
      throw new Error("Browser speech is not supported")
    }

    if (speechMode === "server") {
      this.speechProviderForTurn = "server"
      return
    }

    if (speechMode === "browser") {
      this.speechProviderForTurn = "browser"
      return
    }

    this.speechProviderForTurn = this.browserSpeech.isAvailable()
      ? "browser"
      : "server"
  }

  /**
   * Prepare a playback task for one text segment.
   *
   * The queue calls this eagerly so server synthesis can overlap with the
   * currently playing segment, but the returned task is still executed in the
   * original enqueue order.
   */
  private async prepareSpeechSegment(
    text: string,
    signal?: AbortSignal,
  ): Promise<SpeechPlaybackTask> {
    switch (this.getSpeechMode()) {
      case "server":
        return this.prepareServerSpeechTask(text, signal)
      case "browser":
        return this.prepareBrowserSpeechTask(text, signal)
      default:
        return this.prepareAutoSpeechTask(text, signal)
    }
  }

  /**
   * Synthesize server audio immediately and return a playback task that reuses
   * the prepared blob later.
   */
  private async prepareServerSpeechTask(
    text: string,
    signal?: AbortSignal,
  ): Promise<SpeechPlaybackTask> {
    const blob = await this.synthesizeSpeech(text, signal)

    return () => this.audioPlayback.play(blob, signal)
  }

  /**
   * Return a browser playback task for one text segment.
   */
  private async prepareBrowserSpeechTask(
    text: string,
    signal?: AbortSignal,
  ): Promise<SpeechPlaybackTask> {
    return () => this.browserSpeech.speak(text, signal)
  }

  /**
   * Prepare a playback task for `auto` mode.
   *
   * We prefer the browser for low latency, but if browser speech fails for any
   * segment we permanently switch the remainder of the turn to server TTS so
   * later segments do not keep retrying the failing browser path.
   */
  private async prepareAutoSpeechTask(
    text: string,
    signal?: AbortSignal,
  ): Promise<SpeechPlaybackTask> {
    if (this.getAutoSpeechProvider() === "server") {
      return this.prepareServerSpeechTask(text, signal)
    }

    return async () => {
      // Another segment may already have forced a fallback before this one
      // reaches playback, so re-check the cached provider decision here.
      if (this.getAutoSpeechProvider() === "server") {
        const fallbackPlayback = await this.prepareServerSpeechTask(
          text,
          signal,
        )
        await fallbackPlayback()
        return
      }

      try {
        await this.browserSpeech.speak(text, signal)
      } catch (error) {
        if (signal?.aborted) return

        // Browser speech failed mid-turn. Flip future segments to the server
        // and replay the current segment there so the turn still completes.
        this.speechProviderForTurn = "server"
        const fallbackPlayback = await this.prepareServerSpeechTask(
          text,
          signal,
        )
        await fallbackPlayback()
      }
    }
  }

  /**
   * Read the current provider choice for `auto` mode, lazily defaulting to the
   * browser when supported and the server otherwise.
   */
  private getAutoSpeechProvider(): "browser" | "server" {
    if (this.speechProviderForTurn) {
      return this.speechProviderForTurn
    }

    this.speechProviderForTurn = this.browserSpeech.isAvailable()
      ? "browser"
      : "server"

    return this.speechProviderForTurn
  }

  private handleError(err: Error): void {
    this.liveTranscript = ""
    this.error = err
    this.stateMachine.transition({ type: "ERROR", error: err })
    this.options.onError?.(err)
    this.notify()
  }

  /**
   * Resolve the effective transcription mode for the current client.
   */
  private getTranscriptionMode(): CursorBuddyMediaMode {
    return this.options.transcription?.mode ?? "auto"
  }

  /**
   * Resolve the effective speech mode for the current client.
   */
  private getSpeechMode(): CursorBuddyMediaMode {
    return this.options.speech?.mode ?? "server"
  }

  /**
   * Decide whether speech should start before the full chat response is ready.
   */
  private isSpeechStreamingEnabled(): boolean {
    return this.options.speech?.allowStreaming ?? false
  }

  /**
   * Decide whether this turn should attempt browser speech recognition.
   */
  private shouldAttemptBrowserTranscription(): boolean {
    return this.getTranscriptionMode() !== "server"
  }

  /**
   * Decide whether browser speech recognition is mandatory for this turn.
   */
  private isBrowserTranscriptionRequired(): boolean {
    return this.getTranscriptionMode() === "browser"
  }

  /**
   * Start the recorder and browser speech recognition together.
   *
   * The recorder always runs so we keep waveform updates and preserve a raw
   * audio backup for server fallback in `auto` mode.
   */
  private async beginListeningSession(signal: AbortSignal): Promise<void> {
    const shouldAttemptBrowser = this.shouldAttemptBrowserTranscription()
    const isBrowserTranscriptionAvailable =
      shouldAttemptBrowser && this.liveTranscription.isAvailable()

    if (shouldAttemptBrowser && !isBrowserTranscriptionAvailable) {
      if (this.isBrowserTranscriptionRequired()) {
        throw new Error("Browser transcription is not supported")
      }
    }

    const [voiceCaptureResult, browserTranscriptionResult] =
      await Promise.allSettled([
        this.voiceCapture.start(),
        isBrowserTranscriptionAvailable
          ? this.liveTranscription.start()
          : Promise.resolve(undefined),
      ])

    if (signal.aborted) return

    if (voiceCaptureResult.status === "rejected") {
      throw toError(voiceCaptureResult.reason, "Failed to start microphone")
    }

    // In browser-only mode, a browser STT startup failure should fail the turn.
    // In auto mode we silently keep the recorder alive for server fallback.
    if (
      browserTranscriptionResult.status === "rejected" &&
      this.isBrowserTranscriptionRequired()
    ) {
      throw toError(
        browserTranscriptionResult.reason,
        "Browser transcription failed to start",
      )
    }

    if (browserTranscriptionResult.status === "rejected") {
      this.liveTranscription.dispose()
    }
  }

  /**
   * Stop browser speech recognition and return the best final transcript it
   * produced for this turn.
   */
  private async stopLiveTranscription(): Promise<string> {
    if (
      !this.shouldAttemptBrowserTranscription() ||
      !this.liveTranscription.isAvailable()
    ) {
      return ""
    }

    try {
      return await this.liveTranscription.stop()
    } catch (error) {
      // Browser mode should surface the recognition error directly.
      // Auto mode falls back to the recorded audio instead.
      if (this.isBrowserTranscriptionRequired()) {
        throw toError(error, "Browser transcription failed")
      }

      return ""
    }
  }

  /**
   * Choose the transcript that should drive the turn.
   *
   * Decision tree:
   * 1. Use the browser transcript when it is available.
   * 2. In browser-only mode, fail if the browser produced nothing usable.
   * 3. In auto/server modes, fall back to the recorded audio upload.
   */
  private async resolveTranscript(
    browserTranscript: string,
    audioBlob: Blob,
    signal?: AbortSignal,
  ): Promise<string> {
    const normalizedBrowserTranscript = browserTranscript.trim()
    if (normalizedBrowserTranscript) {
      return normalizedBrowserTranscript
    }

    if (this.getTranscriptionMode() === "browser") {
      throw new Error(
        "Browser transcription did not produce a final transcript",
      )
    }

    return this.transcribe(audioBlob, signal)
  }

  private updateResponse(text: string): void {
    if (this.response === text) return

    this.response = text
    this.notify()
  }

  private notify(): void {
    // Update cached snapshot before notifying (required for useSyncExternalStore)
    this.cachedSnapshot = this.buildSnapshot()
    this.listeners.forEach((listener) => listener())
  }
}
