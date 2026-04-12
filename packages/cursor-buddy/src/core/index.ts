// Types
export type {
  VoiceState,
  PointingTarget,
  Point,
  ScreenshotResult,
  ConversationMessage,
  CursorRenderProps,
  SpeechBubbleRenderProps,
  WaveformRenderProps,
  VoiceMachineEvent,
  VoiceMachineContext,
} from "./types"

// State machine
export { cursorBuddyMachine } from "./machine"
export type { CursorBuddyMachine } from "./machine"

// Pointing utilities
export { parsePointingTag, stripPointingTag } from "./pointing"

// Bezier animation
export { animateBezierFlight } from "./bezier"
export type { BezierFlightCallbacks } from "./bezier"

// Reactive atoms
export {
  $audioLevel,
  $cursorPosition,
  $buddyPosition,
  $buddyRotation,
  $buddyScale,
  $pointingTarget,
  $isEnabled,
  $isSpeaking,
  $conversationHistory,
} from "./atoms"
