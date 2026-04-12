"use client"

import { useSyncExternalStore, useCallback } from "react"
import { useStore } from "@nanostores/react"
import { $audioLevel } from "../core/atoms"
import { useClient } from "./provider"
import type { VoiceState } from "../core/types"

export interface UseCursorBuddyReturn {
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
  /** Whether currently engaged with a pointing target */
  isPointing: boolean
  /** Current error (null if none) */
  error: Error | null

  /** Start listening (called automatically by hotkey) */
  startListening: () => void
  /** Stop listening and process (called automatically by hotkey release) */
  stopListening: () => void
  /** Enable or disable the buddy */
  setEnabled: (enabled: boolean) => void
  /** Manually point at coordinates */
  pointAt: (x: number, y: number, label: string) => void
  /** Dismiss the current pointing target */
  dismissPointing: () => void
  /** Reset to idle state */
  reset: () => void
}

/**
 * Hook to access cursor buddy state and actions.
 */
export function useCursorBuddy(): UseCursorBuddyReturn {
  const client = useClient()

  const subscribe = useCallback(
    (listener: () => void) => client.subscribe(listener),
    [client]
  )
  const getSnapshot = useCallback(() => client.getSnapshot(), [client])

  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getSnapshot)

  const audioLevel = useStore($audioLevel)

  return {
    ...snapshot,
    audioLevel,
    startListening: useCallback(() => client.startListening(), [client]),
    stopListening: useCallback(() => client.stopListening(), [client]),
    setEnabled: useCallback(
      (enabled: boolean) => client.setEnabled(enabled),
      [client]
    ),
    pointAt: useCallback(
      (x: number, y: number, label: string) => client.pointAt(x, y, label),
      [client]
    ),
    dismissPointing: useCallback(() => client.dismissPointing(), [client]),
    reset: useCallback(() => client.reset(), [client]),
  }
}
