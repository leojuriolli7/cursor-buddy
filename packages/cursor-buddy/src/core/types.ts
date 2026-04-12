/**
 * Voice state machine states
 */
export type VoiceState = "idle" | "listening" | "processing" | "responding"

/**
 * Point coordinates parsed from AI response [POINT:x,y:label]
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

/**
 * Conversation message
 */
export interface ConversationMessage {
  role: "user" | "assistant"
  content: string
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
 * Events for the voice state machine
 */
export type VoiceMachineEvent =
  | { type: "HOTKEY_PRESSED" }
  | { type: "HOTKEY_RELEASED" }
  | { type: "TRANSCRIPTION_COMPLETE"; transcript: string }
  | { type: "AI_RESPONSE_START" }
  | { type: "AI_RESPONSE_CHUNK"; text: string }
  | { type: "AI_RESPONSE_COMPLETE"; response: string }
  | { type: "TTS_COMPLETE" }
  | { type: "POINTING_COMPLETE" }
  | { type: "ERROR"; error: Error }
  | { type: "CANCEL" }

/**
 * Context for the voice state machine
 */
export interface VoiceMachineContext {
  transcript: string
  response: string
  error: Error | null
}
