// Main component

// Re-export render prop types for custom components
export type {
  CursorBuddyMediaMode,
  CursorBuddySpeechConfig,
  CursorBuddyTranscriptionConfig,
  CursorRenderProps,
  SpeechBubbleRenderProps,
  WaveformRenderProps,
} from "../core/types"
export type { CursorBuddyProps } from "./components/CursorBuddy"
export { CursorBuddy } from "./components/CursorBuddy"
export type { UseCursorBuddyReturn } from "./hooks"

export { useCursorBuddy } from "./hooks"
export type { CursorBuddyProviderProps } from "./provider"
// Headless mode
export { CursorBuddyProvider } from "./provider"
