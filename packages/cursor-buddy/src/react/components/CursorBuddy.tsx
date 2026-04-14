"use client"

import type {
  CursorBuddySpeechConfig,
  CursorBuddyTranscriptionConfig,
  PointingTarget,
  VoiceState,
} from "../../core/types"
import { useCursorBuddy } from "../hooks"
import { CursorBuddyProvider } from "../provider"
import { useHotkey } from "../use-hotkey"
import { Overlay, type OverlayProps } from "./Overlay"

export interface CursorBuddyProps
  extends Pick<OverlayProps, "cursor" | "speechBubble" | "waveform"> {
  /** API endpoint for cursor buddy server */
  endpoint: string
  /** Hotkey for push-to-talk (default: "ctrl+alt") */
  hotkey?: string
  /** Container element for portal (defaults to document.body) */
  container?: HTMLElement | null
  /** Transcription configuration */
  transcription?: CursorBuddyTranscriptionConfig
  /** Speech configuration */
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
 * Internal component that sets up hotkey handling
 */
function CursorBuddyInner({
  hotkey = "ctrl+alt",
  cursor,
  speechBubble,
  waveform,
  container,
}: Pick<
  CursorBuddyProps,
  "hotkey" | "cursor" | "speechBubble" | "waveform" | "container"
>) {
  const { startListening, stopListening, isEnabled } = useCursorBuddy()

  // Set up hotkey
  useHotkey(hotkey, startListening, stopListening, isEnabled)

  return (
    <Overlay
      cursor={cursor}
      speechBubble={speechBubble}
      waveform={waveform}
      container={container}
    />
  )
}

/**
 * Drop-in cursor buddy component.
 *
 * Adds an AI-powered cursor companion to your app. Users hold the hotkey
 * (default: Ctrl+Alt) to speak. The SDK captures a screenshot, transcribes
 * speech in the browser or on the server based on the configured mode, sends
 * it to the AI, speaks the response in the browser or on the server based on
 * the configured mode, and can point at elements on screen.
 *
 * @example
 * ```tsx
 * import { CursorBuddy } from "cursor-buddy/react"
 *
 * function App() {
 *   return (
 *     <>
 *       <YourApp />
 *       <CursorBuddy endpoint="/api/cursor-buddy" />
 *     </>
 *   )
 * }
 * ```
 */
export function CursorBuddy({
  endpoint,
  hotkey,
  container,
  speech,
  transcription,
  cursor,
  speechBubble,
  waveform,
  onTranscript,
  onResponse,
  onPoint,
  onStateChange,
  onError,
}: CursorBuddyProps) {
  return (
    <CursorBuddyProvider
      endpoint={endpoint}
      speech={speech}
      transcription={transcription}
      onTranscript={onTranscript}
      onResponse={onResponse}
      onPoint={onPoint}
      onStateChange={onStateChange}
      onError={onError}
    >
      <CursorBuddyInner
        hotkey={hotkey}
        cursor={cursor}
        speechBubble={speechBubble}
        waveform={waveform}
        container={container}
      />
    </CursorBuddyProvider>
  )
}
