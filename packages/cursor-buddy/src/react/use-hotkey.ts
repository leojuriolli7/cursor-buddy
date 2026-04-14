"use client"

import { useEffect, useRef } from "react"
import {
  createHotkeyController,
  type HotkeyController,
  type ParsedHotkey,
  parseHotkey,
} from "../core/hotkeys"

/**
 * Hook for detecting hotkey press/release.
 *
 * Supports:
 * - Modifier-only hotkeys: "ctrl+alt", "cmd", "shift" (for push-to-talk)
 * - Modifier+key hotkeys: "ctrl+k", "cmd+shift+a", "alt+f4"
 * - Key-only hotkeys: "escape", "f1", "a"
 *
 * @param hotkey - Hotkey string like "ctrl+k" or "ctrl+alt"
 * @param onPress - Called when hotkey is pressed
 * @param onRelease - Called when hotkey is released
 * @param enabled - Whether the hotkey listener is active (default: true)
 *
 * @example
 * ```tsx
 * // Push-to-talk with modifier-only
 * useHotkey('ctrl+alt', () => startRecording(), () => stopRecording())
 *
 * // Quick action with modifier+key
 * useHotkey('ctrl+k', () => openCommandPalette(), () => {})
 *
 * // Escape to close
 * useHotkey('escape', () => closeModal(), () => {})
 * ```
 */
export function useHotkey(
  hotkey: string,
  onPress: () => void,
  onRelease: () => void,
  enabled: boolean = true,
): void {
  const parsedHotkeyRef = useRef<ParsedHotkey>(parseHotkey(hotkey))

  useEffect(() => {
    parsedHotkeyRef.current = parseHotkey(hotkey)
  }, [hotkey])

  const onPressRef = useRef(onPress)
  const onReleaseRef = useRef(onRelease)
  onPressRef.current = onPress
  onReleaseRef.current = onRelease

  const controllerRef = useRef<HotkeyController | null>(null)

  useEffect(() => {
    controllerRef.current = createHotkeyController(parsedHotkeyRef.current, {
      onPress: () => onPressRef.current(),
      onRelease: () => onReleaseRef.current(),
      enabled,
    })

    return () => {
      controllerRef.current?.destroy()
      controllerRef.current = null
    }
  }, [])

  useEffect(() => {
    controllerRef.current?.setEnabled(enabled)
  }, [enabled])
}

// Re-export types for convenience
export type { ParsedHotkey } from "../core/hotkeys"
