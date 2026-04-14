import type {
  HotkeyController,
  HotkeyControllerOptions,
  ParsedHotkey,
} from "./types"
import { matchesHotkey, shouldReleaseModifierOnlyHotkey } from "./matcher"

/**
 * Create a hotkey controller that manages press/release state.
 *
 * This is framework-agnostic and can be used with React, Vue, Svelte, etc.
 *
 * @param hotkey - The parsed hotkey to listen for
 * @param options - Controller options including callbacks
 * @returns A HotkeyController instance
 *
 * @example
 * ```ts
 * const controller = createHotkeyController(
 *   parseHotkey('ctrl+k'),
 *   {
 *     onPress: () => console.log('pressed'),
 *     onRelease: () => console.log('released'),
 *     enabled: true,
 *   }
 * )
 *
 * // Later, cleanup
 * controller.destroy()
 * ```
 */
export function createHotkeyController(
  hotkey: ParsedHotkey,
  options: HotkeyControllerOptions,
): HotkeyController {
  let isPressed = false
  let enabled = options.enabled ?? true

  const { onPress, onRelease } = options

  function handleKeyDown(event: KeyboardEvent) {
    if (!enabled) return

    // Check if this is a match
    if (matchesHotkey(event, hotkey)) {
      if (!isPressed) {
        isPressed = true
        event.preventDefault()
        onPress()
      }
    }
  }

  function handleKeyUp(event: KeyboardEvent) {
    if (!isPressed) return

    if (hotkey.isModifierOnly) {
      // For modifier-only hotkeys, release when any required modifier is released
      if (shouldReleaseModifierOnlyHotkey(event, hotkey)) {
        isPressed = false
        onRelease()
      }
    } else {
      // For hotkeys with a specific key, release when that key is released
      const eventKey = event.key.toLowerCase()
      const expectedKey = hotkey.key?.toLowerCase()

      if (eventKey === expectedKey) {
        isPressed = false
        onRelease()
      }
    }
  }

  function handleBlur() {
    // Release if window loses focus while hotkey is pressed
    if (isPressed) {
      isPressed = false
      onRelease()
    }
  }

  // Attach listeners
  window.addEventListener("keydown", handleKeyDown)
  window.addEventListener("keyup", handleKeyUp)
  window.addEventListener("blur", handleBlur)

  return {
    get isPressed() {
      return isPressed
    },

    setEnabled(newEnabled: boolean) {
      enabled = newEnabled

      // If disabling while pressed, trigger release
      if (!enabled && isPressed) {
        isPressed = false
        onRelease()
      }
    },

    destroy() {
      // If pressed when destroyed, release first
      if (isPressed) {
        isPressed = false
        onRelease()
      }

      window.removeEventListener("keydown", handleKeyDown)
      window.removeEventListener("keyup", handleKeyUp)
      window.removeEventListener("blur", handleBlur)
    },
  }
}
