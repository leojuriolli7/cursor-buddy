/**
 * Parsed representation of a hotkey string.
 */
export interface ParsedHotkey {
  /** The non-modifier key (e.g., 'k', 'Escape', 'F1'). Null for modifier-only hotkeys. */
  key: string | null
  /** Whether the Control key is required */
  ctrl: boolean
  /** Whether the Shift key is required */
  shift: boolean
  /** Whether the Alt key is required */
  alt: boolean
  /** Whether the Meta (Command) key is required */
  meta: boolean
  /** Whether this hotkey requires only modifiers (no regular key) */
  isModifierOnly: boolean
}

/**
 * Options for creating a hotkey controller.
 */
export interface HotkeyControllerOptions {
  /** Called when the hotkey is pressed */
  onPress: () => void
  /** Called when the hotkey is released */
  onRelease: () => void
  /** Whether the hotkey listener is active (default: true) */
  enabled?: boolean
}

/**
 * Interface for the hotkey controller instance.
 */
export interface HotkeyController {
  /** Whether the hotkey is currently pressed */
  readonly isPressed: boolean
  /** Update the enabled state */
  setEnabled(enabled: boolean): void
  /** Destroy the controller and remove all listeners */
  destroy(): void
}

/**
 * Valid modifier key names and their aliases.
 */
export type ModifierAlias =
  | "ctrl"
  | "control"
  | "alt"
  | "option"
  | "shift"
  | "meta"
  | "cmd"
  | "command"

/**
 * Canonical modifier names that map to KeyboardEvent properties.
 */
export type CanonicalModifier = "ctrl" | "alt" | "shift" | "meta"
