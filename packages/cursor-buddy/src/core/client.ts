import type { PointToolInput } from "./tools/point-tool"
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
import { StreamProcessor } from "./stream"
import { ToolCallManager } from "./tools"
import type {
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
  ScreenshotResult,
  VoiceCapturePort,
} from "./types"
import { toError } from "./utils/error"

async function readErrorMessage(
  response: Response,
  fallbackMessage: string,
): Promise<string> {
  try {
    const contentType = response.headers.get("Content-Type") ?? ""
    if (contentType.includes("application/json")) {
      const body = (await response.json()) as { error?: string }
      if (body?.error) return body.error
    }
    const text = await response.text()
    if (text) return text
  } catch {
    // Fall back to the generic message
  }
  return fallbackMessage
}

export type { CursorBuddyServices } from "./types"

/**
 * Framework-agnostic client for cursor buddy voice interactions.
 *
 * Manages the complete voice interaction flow:
 * idle -> listening -> processing -> responding -> idle
 *
 * Supports:
 * - Interruption via hotkey
 * - Tool call display with approval flow
 * - Point tool for cursor movement
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
  private toolManager: ToolCallManager

  // State
  private liveTranscript = ""
  private transcript = ""
  private response = ""
  private error: Error | null = null
  private abortController: AbortController | null = null
  private speechProviderForTurn: "browser" | "server" | null = null
  private screenshotPromise: Promise<ScreenshotResult> | null = null
  private currentScreenshot: ScreenshotResult | null = null
  private pendingApprovalResolver: ((approved: boolean) => void) | null = null
  private playbackQueue: TTSPlaybackQueue | null = null

  // Cached snapshot for useSyncExternalStore
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

    // Initialize services
    this.voiceCapture = services.voiceCapture ?? new VoiceCaptureService()
    this.audioPlayback = services.audioPlayback ?? new AudioPlaybackService()
    this.browserSpeech = services.browserSpeech ?? new BrowserSpeechService()
    this.liveTranscription =
      services.liveTranscription ?? new LiveTranscriptionService()
    this.screenCapture = services.screenCapture ?? new ScreenCaptureService()
    this.pointerController =
      services.pointerController ?? new PointerController()
    this.stateMachine = createStateMachine()

    // Initialize tool manager
    this.toolManager = new ToolCallManager(
      {
        onChange: () => this.notify(),
        onApprovalResponse: async () => {
          // Approvals are handled via pendingApprovalResolver
        },
      },
      options.toolDisplay,
    )

    // Initialize cached snapshot
    this.cachedSnapshot = this.buildSnapshot()

    // Wire up audio level
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

  startListening(): void {
    this.abort()

    // Clear UI state
    this.liveTranscript = ""
    this.transcript = ""
    this.response = ""
    this.error = null
    this.speechProviderForTurn = null
    this.currentScreenshot = null
    this.pointerController.release()
    this.toolManager.reset()

    // Transition state
    this.stateMachine.transition({ type: "HOTKEY_PRESSED" })
    this.notify()

    // Start mic
    this.abortController = new AbortController()
    const signal = this.abortController.signal

    // Capture screenshot in parallel
    this.screenshotPromise = this.screenCapture.capture()

    this.beginListeningSession(signal).catch((error) => {
      if (signal.aborted) return
      this.voiceCapture.dispose()
      this.liveTranscription.dispose()
      this.handleError(toError(error, "Failed to start listening"))
    })
  }

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

      // Get screenshot
      if (!this.screenshotPromise) {
        throw new Error("Screenshot was not started")
      }
      this.currentScreenshot = await this.screenshotPromise

      if (turnFailure) throw turnFailure
      if (signal?.aborted) return

      // Resolve transcript
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

      // Build initial messages
      const history = $conversationHistory.get()
      const messages: ConversationMessage[] = [
        ...history,
        { role: "user", content: transcript },
      ]

      // Process chat with potential approval loop
      const { responseText, updatedMessages } = await this.processChatLoop(
        messages,
        this.currentScreenshot,
        signal,
        failTurn,
      )

      if (turnFailure) throw turnFailure
      if (signal?.aborted) return

      this.options.onResponse?.(responseText)

      // Wait for TTS to complete
      if (this.playbackQueue) {
        await this.playbackQueue.waitForCompletion()
      }

      if (turnFailure) throw turnFailure
      if (signal?.aborted) return

      // Update history
      $conversationHistory.set(updatedMessages)

      this.stateMachine.transition({ type: "TTS_COMPLETE" })
    } catch (err) {
      if (turnFailure) {
        this.handleError(turnFailure)
        return
      }
      if (signal?.aborted) return
      this.handleError(toError(err))
    }
  }

  setEnabled(enabled: boolean): void {
    $isEnabled.set(enabled)
    this.notify()
  }

  pointAt(x: number, y: number, label: string): void {
    this.pointerController.pointAt({ x, y, label })
  }

  dismissPointing(): void {
    this.pointerController.release()
  }

  reset(): void {
    this.abort()
    this.liveTranscript = ""
    this.transcript = ""
    this.response = ""
    this.error = null
    this.currentScreenshot = null
    this.pointerController.release()
    this.toolManager.reset()
    this.stateMachine.reset()
    this.notify()
  }

  updateCursorPosition(): void {
    this.pointerController.updateFollowPosition()
  }

  // Tool actions
  async approveToolCall(id: string): Promise<void> {
    if (this.pendingApprovalResolver) {
      this.pendingApprovalResolver(true)
      this.pendingApprovalResolver = null
    }
    await this.toolManager.approve(id)
  }

  async denyToolCall(id: string): Promise<void> {
    if (this.pendingApprovalResolver) {
      this.pendingApprovalResolver(false)
      this.pendingApprovalResolver = null
    }
    await this.toolManager.deny(id)
  }

  dismissToolCall(id: string): void {
    this.toolManager.dismiss(id)
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  getSnapshot(): CursorBuddySnapshot {
    return this.cachedSnapshot
  }

  private buildSnapshot(): CursorBuddySnapshot {
    return {
      state: this.stateMachine.getState(),
      liveTranscript: this.liveTranscript,
      transcript: this.transcript,
      response: this.response,
      error: this.error,
      isPointing: this.pointerController.isPointing(),
      isEnabled: $isEnabled.get(),
      toolCalls: this.toolManager.getToolCalls(),
      activeToolCalls: this.toolManager.getActiveToolCalls(),
      pendingApproval: this.toolManager.getPendingApproval(),
    }
  }

  // === Private Methods ===

  private abort(): void {
    this.abortController?.abort()
    this.abortController = null
    this.screenshotPromise = null
    this.voiceCapture.dispose()
    this.liveTranscription.dispose()
    this.audioPlayback.stop()
    this.browserSpeech.stop()
    this.speechProviderForTurn = null
    this.pendingApprovalResolver = null
    this.toolManager.reset()
    $audioLevel.set(0)
  }

  /**
   * Process chat with approval loop.
   * Returns when the turn is complete (no pending approvals).
   */
  private async processChatLoop(
    messages: ConversationMessage[],
    screenshot: ScreenshotResult,
    signal: AbortSignal | undefined,
    onFailure: (error: Error) => void,
  ): Promise<{
    responseText: string
    updatedMessages: ConversationMessage[]
  }> {
    let currentMessages = [...messages]
    let fullResponseText = ""
    let hasStartedPlayback = false

    // Create playback queue
    this.playbackQueue = new TTSPlaybackQueue({
      onError: onFailure,
      onPlaybackStart: () => {
        if (!hasStartedPlayback) {
          hasStartedPlayback = true
          this.stateMachine.transition({ type: "RESPONSE_STARTED" })
        }
      },
      prepare: (text, currentSignal) =>
        this.prepareSpeechSegment(text, currentSignal),
      signal,
    })

    const shouldStreamSpeech = this.isSpeechStreamingEnabled()

    while (true) {
      if (signal?.aborted) break

      // Capture fresh screenshot for continuation requests
      let currentScreenshot = screenshot
      if (currentMessages.length > messages.length) {
        // This is a continuation - capture fresh screenshot
        currentScreenshot = await this.screenCapture.capture()
      }

      // Fetch chat stream
      const response = await this.fetchChatStream(
        currentMessages,
        currentScreenshot,
        signal,
      )

      // Process the stream
      const { responseText, requiresApprovalContinuation, pendingApproval } =
        await this.consumeStream(
          response,
          currentScreenshot,
          shouldStreamSpeech,
          signal,
        )

      fullResponseText = responseText
      this.response = responseText
      this.notify()

      // Add assistant message to history
      currentMessages = [
        ...currentMessages,
        { role: "assistant", content: responseText },
      ]

      if (!requiresApprovalContinuation || !pendingApproval) {
        // No approval needed, turn complete
        break
      }

      // Pause TTS for approval
      this.playbackQueue.pauseAfterCurrent()

      // Wait for user approval
      const approved = await this.waitForApproval()

      // Resume TTS
      this.playbackQueue.resume()

      // Add approval response to messages
      currentMessages = [
        ...currentMessages,
        {
          role: "tool",
          content: [
            {
              type: "tool-approval-response" as const,
              approvalId: pendingApproval.approvalId,
              approved,
            },
          ],
        },
      ]

      // Continue the loop with updated messages
    }

    return {
      responseText: fullResponseText,
      updatedMessages: currentMessages,
    }
  }

  private async fetchChatStream(
    messages: ConversationMessage[],
    screenshot: ScreenshotResult,
    signal: AbortSignal | undefined,
  ): Promise<Response> {
    const response = await fetch(`${this.endpoint}/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages,
        screenshot: screenshot.imageData,
        capture: {
          width: screenshot.width,
          height: screenshot.height,
        },
        domSnapshot: screenshot.domSnapshot,
      }),
      signal,
    })

    if (!response.ok) {
      throw new Error(await readErrorMessage(response, "Chat request failed"))
    }

    return response
  }

  private async consumeStream(
    response: Response,
    screenshot: ScreenshotResult,
    shouldStreamSpeech: boolean,
    signal: AbortSignal | undefined,
  ): Promise<{
    responseText: string
    requiresApprovalContinuation: boolean
    pendingApproval?: {
      approvalId: string
      toolCallId: string
      toolName: string
      args: unknown
    }
  }> {
    const reader = response.body?.getReader()
    if (!reader) throw new Error("No response body")

    const decoder = new TextDecoder()
    const state: { pointToolCall: PointToolInput | null } = {
      pointToolCall: null,
    }

    const processor = new StreamProcessor({
      onTextDelta: () => {
        // Text is accumulated in the processor
      },
      onSpeechSegment: (text) => {
        if (shouldStreamSpeech && this.playbackQueue) {
          this.playbackQueue.enqueue(text)
        }
      },
      onToolCall: (event) => {
        // Check if it's the point tool
        if (event.toolName === "point") {
          const input = event.args as { elementId?: number; label?: string }
          if (
            input &&
            typeof input.elementId === "number" &&
            typeof input.label === "string"
          ) {
            state.pointToolCall = {
              elementId: input.elementId,
              label: input.label,
            }
          }
        } else {
          // Regular tool - add to manager
          this.toolManager.handleToolCall(event)
          this.options.onToolCall?.({
            id: event.toolCallId,
            toolName: event.toolName,
            args: event.args,
          })
        }
      },
      onApprovalRequest: (event) => {
        this.toolManager.handleApprovalRequest(event)
      },
      onToolResult: (event) => {
        const toolCall = this.toolManager.getToolCall(event.toolCallId)
        this.toolManager.handleToolResult(event)
        if (toolCall) {
          this.options.onToolResult?.({
            id: event.toolCallId,
            toolName: toolCall.toolName,
            result: event.result,
          })
        }
      },
      onToolError: (event) => {
        this.toolManager.handleToolError(event)
      },
      onFinish: () => {
        // Stream finished
      },
      onError: (error) => {
        throw new Error(error)
      },
    })

    // Read the stream
    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      const chunk = decoder.decode(value, { stream: true })
      processor.processChunk(chunk)

      // Update visible response
      this.response = processor.getResponseText()
      this.notify()
    }

    // Process any remaining data
    const trailingChunk = decoder.decode()
    if (trailingChunk) {
      processor.processChunk(trailingChunk)
    }

    const result = processor.finish()

    // Handle point tool
    if (state.pointToolCall !== null) {
      const pointCall = state.pointToolCall
      const element = screenshot.elementRegistry.get(pointCall.elementId)
      if (element) {
        const rect = element.getBoundingClientRect()
        const x = Math.round(rect.left + rect.width / 2)
        const y = Math.round(rect.top + rect.height / 2)
        const target: PointingTarget = {
          x,
          y,
          label: pointCall.label,
        }
        this.options.onPoint?.(target)
        this.pointerController.pointAt(target)
      }
    }

    // Queue full response if not streaming speech
    if (!shouldStreamSpeech && this.playbackQueue) {
      this.playbackQueue.enqueue(result.responseText)
    }

    return result
  }

  private waitForApproval(): Promise<boolean> {
    return new Promise((resolve) => {
      this.pendingApprovalResolver = resolve
    })
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

    const data = (await response.json()) as { text: string }
    return data.text
  }

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

  private async prepareServerSpeechTask(
    text: string,
    signal?: AbortSignal,
  ): Promise<SpeechPlaybackTask> {
    const blob = await this.synthesizeSpeech(text, signal)
    return () => this.audioPlayback.play(blob, signal)
  }

  private async prepareBrowserSpeechTask(
    _text: string,
    signal?: AbortSignal,
  ): Promise<SpeechPlaybackTask> {
    return () => this.browserSpeech.speak(_text, signal)
  }

  private async prepareAutoSpeechTask(
    text: string,
    signal?: AbortSignal,
  ): Promise<SpeechPlaybackTask> {
    if (this.getAutoSpeechProvider() === "server") {
      return this.prepareServerSpeechTask(text, signal)
    }

    return async () => {
      if (this.getAutoSpeechProvider() === "server") {
        const fallback = await this.prepareServerSpeechTask(text, signal)
        await fallback()
        return
      }

      try {
        await this.browserSpeech.speak(text, signal)
      } catch {
        if (signal?.aborted) return
        this.speechProviderForTurn = "server"
        const fallback = await this.prepareServerSpeechTask(text, signal)
        await fallback()
      }
    }
  }

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

  private getTranscriptionMode(): CursorBuddyMediaMode {
    return this.options.transcription?.mode ?? "auto"
  }

  private getSpeechMode(): CursorBuddyMediaMode {
    return this.options.speech?.mode ?? "server"
  }

  private isSpeechStreamingEnabled(): boolean {
    return this.options.speech?.allowStreaming ?? false
  }

  private shouldAttemptBrowserTranscription(): boolean {
    return this.getTranscriptionMode() !== "server"
  }

  private isBrowserTranscriptionRequired(): boolean {
    return this.getTranscriptionMode() === "browser"
  }

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
      if (this.isBrowserTranscriptionRequired()) {
        throw toError(error, "Browser transcription failed")
      }
      return ""
    }
  }

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

  private notify(): void {
    this.cachedSnapshot = this.buildSnapshot()
    this.listeners.forEach((listener) => listener())
  }
}
