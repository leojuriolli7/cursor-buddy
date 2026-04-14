// Core client

export type { CursorBuddyServices } from "./client"
export { CursorBuddyClient } from "./client"
// Hotkeys
export type {
  CanonicalModifier,
  HotkeyController,
  HotkeyControllerOptions,
  ModifierAlias,
  ParsedHotkey,
} from "./hotkeys"
export {
  createHotkeyController,
  formatHotkey,
  isModifierReleased,
  matchesHotkey,
  parseHotkey,
  parseKeyboardEvent,
  shouldReleaseModifierOnlyHotkey,
} from "./hotkeys"
// Types
export type {
  BrowserSpeechPort,
  ConversationMessage,
  CursorBuddyClientOptions,
  CursorBuddyMediaMode,
  CursorBuddySnapshot,
  CursorBuddySpeechConfig,
  CursorBuddyTranscriptionConfig,
  CursorRenderProps,
  LiveTranscriptionPort,
  Point,
  PointingTarget,
  ScreenshotResult,
  SpeechBubbleRenderProps,
  VoiceEvent,
  VoiceState,
  WaveformRenderProps,
} from "./types"
