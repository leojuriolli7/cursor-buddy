/**
 * Voice state machine states
 */
export type VoiceState = "idle" | "listening" | "processing" | "responding"

/**
 * Events for the voice state machine
 */
export type VoiceEvent =
  | { type: "HOTKEY_PRESSED" }
  | { type: "HOTKEY_RELEASED" }
  | { type: "RESPONSE_STARTED" }
  | { type: "TTS_COMPLETE" }
  | { type: "ERROR"; error: Error }

/**
 * Point coordinates parsed from AI response.
 * Supports two formats:
 * - Marker-based: [POINT:5:label] - references a numbered marker
 * - Coordinate-based: [POINT:640,360:label] - raw pixel coordinates
 */
export interface PointingTarget {
  /** X coordinate in viewport pixels (top-left origin) */
  x: number
  /** Y coordinate in viewport pixels (top-left origin) */
  y: number
  /** Label to display in speech bubble */
  label: string
}

/**
 * Parsed pointing tag result - either marker ID or coordinates.
 */
export type ParsedPointingTag =
  | { type: "marker"; markerId: number; label: string }
  | { type: "coordinates"; x: number; y: number; label: string }

/**
 * 2D point
 */
export interface Point {
  x: number
  y: number
}

/**
 * Screenshot capture result
 */
export interface ScreenshotResult {
  /** Base64-encoded image data URL */
  imageData: string
  /** Screenshot image width in pixels (after any downscaling) */
  width: number
  /** Screenshot image height in pixels (after any downscaling) */
  height: number
  /** Live browser viewport width in CSS pixels */
  viewportWidth: number
  /** Live browser viewport height in CSS pixels */
  viewportHeight: number
}

// Re-export MarkerMap type from elements module
export type { ElementMarker, MarkerMap } from "./utils/elements"

/**
 * Annotated screenshot result with marker map.
 */
export interface AnnotatedScreenshotResult extends ScreenshotResult {
  /** Map of marker ID to element reference */
  markerMap: import("./utils/elements").MarkerMap
  /** Text description of markers for AI context */
  markerContext: string
}

/**
 * Conversation message
 */
export interface ConversationMessage {
  role: "user" | "assistant"
  content: string
}

/**
 * Selects where media processing happens.
 */
export type CursorBuddyMediaMode = "auto" | "browser" | "server"

/**
 * Controls how user speech is transcribed before it is sent to the chat model.
 */
export interface CursorBuddyTranscriptionConfig {
  /**
   * Selects where transcription happens.
   *
   * - "auto": Try browser speech recognition first, then fall back to server
   *   transcription if browser recognition is unavailable, fails, or does not
   *   produce a final transcript.
   * - "browser": Require browser speech recognition. If it is unavailable or
   *   fails, the turn errors and no server fallback is attempted.
   * - "server": Skip browser speech recognition and always use server
   *   transcription.
   *
   * @default "auto"
   */
  mode?: CursorBuddyMediaMode
}

/**
 * Controls how assistant speech is synthesized before it is played back.
 */
export interface CursorBuddySpeechConfig {
  /**
   * Selects where speech synthesis happens.
   *
   * - "auto": Try browser speech synthesis first, then fall back to server
   *   synthesis if browser speech is unavailable or fails.
   * - "browser": Require browser speech synthesis. If it is unavailable or
   *   fails, the turn errors and no server fallback is attempted.
   * - "server": Skip browser speech synthesis and always use server TTS.
   *
   * @default "server"
   */
  mode?: CursorBuddyMediaMode

  /**
   * Whether speech may start before the full chat response is available.
   *
   * When enabled, completed sentence segments are spoken as soon as they are
   * ready. When disabled, speech waits for the full chat response first.
   *
   * @default false
   */
  allowStreaming?: boolean
}

/**
 * Public contract for voice capture used by the core client.
 */
export interface VoiceCapturePort {
  start(): Promise<void>
  stop(): Promise<Blob>
  onLevel(callback: (level: number) => void): void
  dispose(): void
}

/**
 * Public contract for audio playback used by the core client.
 */
export interface AudioPlaybackPort {
  play(blob: Blob, signal?: AbortSignal): Promise<void>
  stop(): void
}

/**
 * Public contract for browser-side live transcription.
 */
export interface LiveTranscriptionPort {
  isAvailable(): boolean
  start(): Promise<void>
  stop(): Promise<string>
  onPartial(callback: (text: string) => void): void
  dispose(): void
}

/**
 * Public contract for browser-side speech synthesis.
 */
export interface BrowserSpeechPort {
  isAvailable(): boolean
  speak(text: string, signal?: AbortSignal): Promise<void>
  stop(): void
}

/**
 * Public contract for screenshot capture used by the core client.
 */
export interface ScreenCapturePort {
  capture(): Promise<ScreenshotResult>
  captureAnnotated(): Promise<AnnotatedScreenshotResult>
}

/**
 * Public contract for pointer control used by the core client.
 */
export interface PointerControllerPort {
  pointAt(target: PointingTarget): void
  release(): void
  isPointing(): boolean
  subscribe(listener: () => void): () => void
  updateFollowPosition(): void
}

/**
 * Internal services interface for dependency injection.
 */
export interface CursorBuddyServices {
  voiceCapture?: VoiceCapturePort
  audioPlayback?: AudioPlaybackPort
  liveTranscription?: LiveTranscriptionPort
  browserSpeech?: BrowserSpeechPort
  screenCapture?: ScreenCapturePort
  pointerController?: PointerControllerPort
}

/**
 * Cursor render props passed to custom cursor components
 */
export interface CursorRenderProps {
  /** Current voice state */
  state: VoiceState
  /** Whether cursor is currently engaged with a pointing target */
  isPointing: boolean
  /** Rotation in radians (direction of travel during pointing) */
  rotation: number
  /** Scale factor (1.0 normal, up to 1.3 during flight) */
  scale: number
}

/**
 * Speech bubble render props
 */
export interface SpeechBubbleRenderProps {
  /** Text to display */
  text: string
  /** Whether bubble is visible */
  isVisible: boolean
  /** Called when the bubble should be dismissed */
  onClick?: () => void
}

/**
 * Waveform render props
 */
export interface WaveformRenderProps {
  /** Current audio level (0-1) */
  audioLevel: number
  /** Whether currently listening */
  isListening: boolean
}

/**
 * Configuration options for CursorBuddyClient
 */
export interface CursorBuddyClientOptions {
  /**
   * Transcription configuration.
   *
   * If omitted, Cursor Buddy uses `{ mode: "auto" }`.
   */
  transcription?: CursorBuddyTranscriptionConfig
  /**
   * Speech configuration.
   *
   * If omitted, Cursor Buddy uses
   * `{ mode: "server", allowStreaming: false }`.
   */
  speech?: CursorBuddySpeechConfig
  /** Callback when transcript is ready */
  onTranscript?: (text: string) => void
  /** Callback when AI responds */
  onResponse?: (text: string) => void
  /** Callback when pointing at element */
  onPoint?: (target: PointingTarget) => void
  /** Callback when state changes */
  onStateChange?: (state: VoiceState) => void
  /** Callback when error occurs */
  onError?: (error: Error) => void
}

/**
 * Client snapshot for React's useSyncExternalStore
 */
export interface CursorBuddySnapshot {
  /** Current voice state */
  state: VoiceState
  /**
   * In-progress transcript while the user is speaking.
   * Populated only when browser transcription is active.
   */
  liveTranscript: string
  /** Latest transcribed user speech */
  transcript: string
  /** Latest AI response (stripped of POINT tags) */
  response: string
  /** Current error (null if none) */
  error: Error | null
  /** Whether currently engaged with a pointing target */
  isPointing: boolean
  /** Whether the buddy is enabled */
  isEnabled: boolean
}
