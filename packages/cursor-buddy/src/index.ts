// Core client for headless/non-React usage
export { CursorBuddyClient } from "./core/client"
// Core types
export type {
  BrowserSpeechPort,
  CursorBuddyClientOptions,
  CursorBuddyMediaMode,
  CursorBuddySnapshot,
  CursorBuddySpeechConfig,
  CursorBuddyTranscriptionConfig,
  Point,
  PointingTarget,
  VoiceEvent,
  VoiceState,
} from "./core/types"
export type { PointToolInput } from "./shared/point-tool"
// Point tool for type-safe access to pointing arguments
export { pointTool } from "./shared/point-tool"
