import type { ParsedHotkey } from "./types"

/**
 * Modifier aliases mapping to canonical names.
 */
const MODIFIER_ALIASES: Record<string, string> = {
  // Control variants
  ctrl: "ctrl",
  control: "ctrl",
  // Alt variants
  alt: "alt",
  option: "alt",
  // Shift variants
  shift: "shift",
  // Meta variants
  meta: "meta",
  cmd: "meta",
  command: "meta",
}

/**
 * Set of all valid modifier names (including aliases).
 */
const VALID_MODIFIERS = new Set(Object.keys(MODIFIER_ALIASES))

/**
 * Check if a key is a modifier.
 */
function isModifierKey(key: string): boolean {
  return VALID_MODIFIERS.has(key.toLowerCase())
}

/**
 * Normalize a key name to lowercase for consistent comparison.
 */
function normalizeKey(key: string): string {
  // Handle special cases
  const lower = key.toLowerCase()

  // Normalize common key variations
  if (lower === "esc") return "escape"
  if (lower === "del") return "delete"
  if (lower === "space") return " "
  if (lower === "spacebar") return " "

  return lower
}

/**
 * Parse a hotkey string into a ParsedHotkey object.
 *
 * Supports:
 * - Modifier-only: "ctrl+alt", "cmd", "shift"
 * - Modifier+key: "ctrl+k", "cmd+shift+a", "alt+f4"
 * - Key-only: "escape", "f1", "a"
 *
 * @param hotkey - The hotkey string to parse (e.g., 'ctrl+k', 'cmd+shift', 'escape')
 * @returns A ParsedHotkey object
 *
 * @example
 * ```ts
 * parseHotkey('ctrl+k')
 * // { key: 'k', ctrl: true, shift: false, alt: false, meta: false, isModifierOnly: false }
 *
 * parseHotkey('cmd+shift')
 * // { key: null, ctrl: false, shift: true, alt: false, meta: true, isModifierOnly: true }
 *
 * parseHotkey('escape')
 * // { key: 'escape', ctrl: false, shift: false, alt: false, meta: false, isModifierOnly: false }
 * ```
 */
export function parseHotkey(hotkey: string): ParsedHotkey {
  const parts = hotkey
    .toLowerCase()
    .split("+")
    .map((p) => p.trim())

  const modifiers = {
    ctrl: false,
    alt: false,
    shift: false,
    meta: false,
  }

  let key: string | null = null

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i]
    if (!part) continue

    const canonicalModifier = MODIFIER_ALIASES[part]

    if (canonicalModifier) {
      // This part is a modifier
      switch (canonicalModifier) {
        case "ctrl":
          modifiers.ctrl = true
          break
        case "alt":
          modifiers.alt = true
          break
        case "shift":
          modifiers.shift = true
          break
        case "meta":
          modifiers.meta = true
          break
      }
    } else {
      // This part is the key
      // If we've already found a key, combine them (e.g., for "ctrl+plus")
      key = key ? `${key}+${normalizeKey(part)}` : normalizeKey(part)
    }
  }

  const isModifierOnly = key === null

  return {
    key,
    ...modifiers,
    isModifierOnly,
  }
}

/**
 * Convert a KeyboardEvent to a ParsedHotkey representation.
 *
 * @param event - The keyboard event
 * @returns A ParsedHotkey representing the current key state
 */
export function parseKeyboardEvent(event: KeyboardEvent): ParsedHotkey {
  const key = normalizeKey(event.key)

  // Check if the key itself is a modifier being pressed
  const isKeyAModifier = isModifierKey(key)

  return {
    key: isKeyAModifier ? null : key,
    ctrl: event.ctrlKey,
    alt: event.altKey,
    shift: event.shiftKey,
    meta: event.metaKey,
    isModifierOnly: isKeyAModifier,
  }
}

/**
 * Format a ParsedHotkey back to a string representation.
 *
 * @param parsed - The parsed hotkey
 * @returns A formatted string like "ctrl+k" or "cmd+shift"
 */
export function formatHotkey(parsed: ParsedHotkey): string {
  const parts: string[] = []

  if (parsed.ctrl) parts.push("ctrl")
  if (parsed.alt) parts.push("alt")
  if (parsed.shift) parts.push("shift")
  if (parsed.meta) parts.push("meta")

  if (parsed.key) {
    parts.push(parsed.key)
  }

  return parts.join("+")
}
