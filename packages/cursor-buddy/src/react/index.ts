// Main component
export { CursorBuddy } from "./components/CursorBuddy"
export type { CursorBuddyProps } from "./components/CursorBuddy"

// Headless mode
export { CursorBuddyProvider } from "./provider"
export type { CursorBuddyProviderProps } from "./provider"

export { useCursorBuddy } from "./hooks"
export type { UseCursorBuddyReturn } from "./hooks"

// Re-export render prop types for custom components
export type {
  CursorRenderProps,
  SpeechBubbleRenderProps,
  WaveformRenderProps,
} from "../core/types"
