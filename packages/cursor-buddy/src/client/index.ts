// Main component
export { CursorBuddy } from "./CursorBuddy"
export type { CursorBuddyProps } from "./CursorBuddy"

// Headless mode
export { CursorBuddyProvider } from "./CursorBuddyProvider"
export type { CursorBuddyProviderProps } from "./CursorBuddyProvider"

export { useCursorBuddy } from "./hooks/useCursorBuddy"
export type { CursorBuddyContextValue } from "./context"

// Re-export render prop types for custom components
export type {
  CursorRenderProps,
  SpeechBubbleRenderProps,
  WaveformRenderProps,
} from "../core/types"
