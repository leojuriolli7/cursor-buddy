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

// Re-export tool types
export type {
  ToolCallStatus,
  ToolCallState,
  ToolBubbleRenderProps,
  ToolDisplayOptions,
  ToolDisplayConfig,
  ToolCallEvent,
  ToolResultEvent,
} from "../core/tools"

export type { CursorBuddyProps } from "./components/CursorBuddy"
export { CursorBuddy } from "./components/CursorBuddy"
export type { UseCursorBuddyReturn } from "./hooks"

export { useCursorBuddy } from "./hooks"
export type { CursorBuddyProviderProps } from "./provider"

// Headless mode
export { CursorBuddyProvider } from "./provider"

// Tool bubble components for custom rendering
export { ToolBubble } from "./components/ToolBubble"
export type { ToolBubbleProps } from "./components/ToolBubble"
export { ToolBubbleStack } from "./components/ToolBubbleStack"
export type { ToolBubbleStackProps } from "./components/ToolBubbleStack"
