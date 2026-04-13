import { createStateMachine, type StateMachine } from "./state-machine"
import { VoiceCaptureService } from "./services/voice-capture"
import { AudioPlaybackService } from "./services/audio-playback"
import { ScreenCaptureService } from "./services/screen-capture"
import { PointerController } from "./services/pointer-controller"
import { $audioLevel, $conversationHistory, $isEnabled } from "./atoms"
import { parsePointingTag, stripPointingTag } from "./pointing"
import type {
  VoiceState,
  CursorBuddyClientOptions,
  CursorBuddySnapshot,
  PointingTarget,
  ScreenshotResult,
  ConversationMessage,
} from "./types"

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

function mapPointToViewport(
  target: PointingTarget,
  screenshot: ScreenshotResult,
): PointingTarget {
  if (screenshot.width <= 0 || screenshot.height <= 0) {
    return target
  }

  const scaleX = screenshot.viewportWidth / screenshot.width
  const scaleY = screenshot.viewportHeight / screenshot.height

  return {
    ...target,
    x: clamp(
      Math.round(target.x * scaleX),
      0,
      Math.max(screenshot.viewportWidth - 1, 0),
    ),
    y: clamp(
      Math.round(target.y * scaleY),
      0,
      Math.max(screenshot.viewportHeight - 1, 0),
    ),
  }
}

/**
 * Internal services interface for dependency injection (testing).
 */
export interface CursorBuddyServices {
  voiceCapture?: VoiceCaptureService
  audioPlayback?: AudioPlaybackService
  screenCapture?: ScreenCaptureService
  pointerController?: PointerController
}

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
  private voiceCapture: VoiceCaptureService
  private audioPlayback: AudioPlaybackService
  private screenCapture: ScreenCaptureService
  private pointerController: PointerController
  private stateMachine: StateMachine

  // State
  private transcript = ""
  private response = ""
  private error: Error | null = null
  private abortController: AbortController | null = null

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
    this.screenCapture = services.screenCapture ?? new ScreenCaptureService()
    this.pointerController =
      services.pointerController ?? new PointerController()
    this.stateMachine = createStateMachine()

    // Initialize cached snapshot
    this.cachedSnapshot = this.buildSnapshot()

    // Wire up audio level to atom
    this.voiceCapture.onLevel((level) => $audioLevel.set(level))

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
    this.transcript = ""
    this.response = ""
    this.error = null
    this.pointerController.release()

    // 3. Transition state
    this.stateMachine.transition({ type: "HOTKEY_PRESSED" })
    this.notify()

    // 4. Start mic (async, errors go to error state)
    this.abortController = new AbortController()
    this.voiceCapture.start().catch((err) => this.handleError(err))
  }

  /**
   * Stop listening and process the voice input.
   */
  async stopListening(): Promise<void> {
    if (this.stateMachine.getState() !== "listening") return

    this.stateMachine.transition({ type: "HOTKEY_RELEASED" })
    const signal = this.abortController?.signal

    try {
      // Stop mic, capture screenshot in parallel
      const [audioBlob, screenshot] = await Promise.all([
        this.voiceCapture.stop(),
        this.screenCapture.capture(),
      ])

      if (signal?.aborted) return

      // Transcribe
      const transcript = await this.transcribe(audioBlob, signal)
      if (signal?.aborted) return

      this.transcript = transcript
      this.options.onTranscript?.(transcript)
      this.notify()

      // Chat
      const response = await this.chat(transcript, screenshot, signal)
      if (signal?.aborted) return

      // Parse pointing tag and strip from response
      const pointTarget = parsePointingTag(response)
      const cleanResponse = stripPointingTag(response)

      this.response = cleanResponse
      this.stateMachine.transition({
        type: "AI_RESPONSE_COMPLETE",
        response: cleanResponse,
      })
      this.options.onResponse?.(cleanResponse)

      // Update history (only on success, never partial)
      const history = $conversationHistory.get()
      const newHistory: ConversationMessage[] = [
        ...history,
        { role: "user", content: transcript },
        { role: "assistant", content: cleanResponse },
      ]
      $conversationHistory.set(newHistory)

      // Point if needed
      if (pointTarget) {
        const mappedTarget = mapPointToViewport(pointTarget, screenshot)
        this.options.onPoint?.(mappedTarget)
        this.pointerController.pointAt(mappedTarget)
      }

      // TTS
      if (cleanResponse) {
        await this.speak(cleanResponse, signal)
      }
      if (signal?.aborted) return

      this.stateMachine.transition({ type: "TTS_COMPLETE" })
    } catch (err) {
      // Interruption is not an error
      if (signal?.aborted) return
      this.handleError(err instanceof Error ? err : new Error("Unknown error"))
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
    this.transcript = ""
    this.response = ""
    this.error = null
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
      transcript: this.transcript,
      response: this.response,
      error: this.error,
      isPointing: this.pointerController.isPointing(),
      isEnabled: $isEnabled.get(),
    }
  }

  // === Private Methods ===

  private abort(): void {
    this.abortController?.abort()
    this.abortController = null
    this.audioPlayback.stop()
    // Reset audio level on abort
    $audioLevel.set(0)
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
      throw new Error("Transcription failed")
    }

    const { text } = await response.json()
    return text
  }

  private async chat(
    transcript: string,
    screenshot: ScreenshotResult,
    signal?: AbortSignal,
  ): Promise<string> {
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
      }),
      signal,
    })

    if (!response.ok) {
      throw new Error("Chat request failed")
    }

    // Stream the response
    const reader = response.body?.getReader()
    if (!reader) throw new Error("No response body")

    const decoder = new TextDecoder()
    let fullResponse = ""

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      const chunk = decoder.decode(value, { stream: true })
      fullResponse += chunk

      // Update response progressively for UI
      this.response = stripPointingTag(fullResponse)
      this.notify()
    }

    return fullResponse
  }

  private async speak(text: string, signal?: AbortSignal): Promise<void> {
    const response = await fetch(`${this.endpoint}/tts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
      signal,
    })

    if (!response.ok) {
      throw new Error("TTS request failed")
    }

    const audioBlob = await response.blob()
    await this.audioPlayback.play(audioBlob, signal)
  }

  private handleError(err: Error): void {
    this.error = err
    this.stateMachine.transition({ type: "ERROR", error: err })
    this.options.onError?.(err)
    this.notify()
  }

  private notify(): void {
    // Update cached snapshot before notifying (required for useSyncExternalStore)
    this.cachedSnapshot = this.buildSnapshot()
    this.listeners.forEach((listener) => listener())
  }
}
