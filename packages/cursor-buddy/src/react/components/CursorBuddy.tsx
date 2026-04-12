"use client"

import {
  CursorBuddyProvider,
  type CursorBuddyProviderProps,
} from "../provider"
import { Overlay, type OverlayProps } from "./Overlay"
import { useHotkey } from "../use-hotkey"
import { useCursorBuddy } from "../hooks"
import type { PointingTarget, VoiceState } from "../../core/types"

export interface CursorBuddyProps
  extends Pick<OverlayProps, "cursor" | "speechBubble" | "waveform"> {
  /** API endpoint for cursor buddy server */
  endpoint: string
  /** Hotkey for push-to-talk (default: "ctrl+alt") */
  hotkey?: string
  /** Container element for portal (defaults to document.body) */
  container?: HTMLElement | null
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
 * the speech, sends it to the AI, speaks the response, and can point at
 * elements on screen.
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
