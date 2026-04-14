import type { ParsedHotkey } from "./types"

/**
 * Check if a keyboard event matches a parsed hotkey.
 *
 * For modifier-only hotkeys: matches when all required modifiers are pressed.
 * For modifier+key hotkeys: matches when the specific key is pressed with required modifiers.
 *
 * @param event - The keyboard event
 * @param hotkey - The parsed hotkey to match against
 * @returns True if the event matches the hotkey
 */
export function matchesHotkey(
  event: KeyboardEvent,
  hotkey: ParsedHotkey,
): boolean {
  // First check if modifiers match
  const modifiersMatch =
    event.ctrlKey === hotkey.ctrl &&
    event.altKey === hotkey.alt &&
    event.shiftKey === hotkey.shift &&
    event.metaKey === hotkey.meta

  if (!modifiersMatch) {
    return false
  }

  if (hotkey.isModifierOnly) {
    // For modifier-only hotkeys, we just need the modifiers to match
    // The key itself doesn't matter (we're listening for modifier keydown/keyup)
    return true
  }

  // For hotkeys with a specific key, check if the event key matches
  // We normalize to lowercase for comparison
  const eventKey = event.key.toLowerCase()
  const expectedKey = hotkey.key?.toLowerCase()

  return eventKey === expectedKey
}

/**
 * Check if a keyboard event should trigger a release for a modifier-only hotkey.
 *
 * For modifier-only hotkeys, we release when ANY of the required modifiers is released.
 *
 * @param event - The keyboard event
 * @param hotkey - The parsed hotkey
 * @returns True if the hotkey should be released
 */
export function shouldReleaseModifierOnlyHotkey(
  event: KeyboardEvent,
  hotkey: ParsedHotkey,
): boolean {
  if (!hotkey.isModifierOnly) {
    return false
  }

  // Check if any required modifier was released
  if (hotkey.ctrl && !event.ctrlKey) return true
  if (hotkey.alt && !event.altKey) return true
  if (hotkey.shift && !event.shiftKey) return true
  if (hotkey.meta && !event.metaKey) return true

  return false
}

/**
 * Check if the event represents a modifier key being released.
 *
 * @param event - The keyboard event
 * @returns True if a modifier key was released
 */
export function isModifierReleased(event: KeyboardEvent): boolean {
  const key = event.key.toLowerCase()

  // Check if the released key is a modifier
  const isCtrl = key === "control" || key === "ctrl"
  const isAlt = key === "alt"
  const isShift = key === "shift"
  const isMeta =
    key === "meta" || key === "command" || key === "cmd" || key === "os"

  return isCtrl || isAlt || isShift || isMeta
}
