import { createContext } from "react"
import type { VoiceState, PointingTarget } from "../core/types"

export interface CursorBuddyContextValue {
  /** Current voice state */
  state: VoiceState
  /** Latest transcribed user speech */
  transcript: string
  /** Latest AI response (stripped of POINT tags) */
  response: string
  /** Current audio level (0-1) */
  audioLevel: number
  /** Whether the buddy is enabled */
  isEnabled: boolean
  /** Whether TTS is currently playing */
  isSpeaking: boolean
  /** Whether currently pointing at a target */
  isPointing: boolean
  /** Current error (null if none) */
  error: Error | null

  /** Start listening (called automatically by hotkey) */
  startListening: () => void
  /** Stop listening and process (called automatically by hotkey release) */
  stopListening: () => void
  /** Enable or disable the buddy */
  setEnabled: (enabled: boolean) => void
  /** Manually speak text via TTS */
  speak: (text: string) => Promise<void>
  /** Manually point at coordinates */
  pointAt: (x: number, y: number, label: string) => void
  /** Reset to idle state */
  reset: () => void
}

export const CursorBuddyContext = createContext<CursorBuddyContextValue | null>(
  null
)
