import { useEffect, useRef } from "react";

interface HotkeyModifiers {
  ctrl: boolean;
  alt: boolean;
  shift: boolean;
  meta: boolean;
}

/**
 * Parse a hotkey string like "ctrl+alt" into modifier flags
 */
function parseHotkey(hotkey: string): HotkeyModifiers {
  const parts = hotkey.toLowerCase().split("+");
  return {
    ctrl: parts.includes("ctrl") || parts.includes("control"),
    alt: parts.includes("alt") || parts.includes("option"),
    shift: parts.includes("shift"),
    meta:
      parts.includes("meta") ||
      parts.includes("cmd") ||
      parts.includes("command"),
  };
}

/**
 * Check if a keyboard event matches the required modifiers
 */
function matchesHotkey(
  event: KeyboardEvent,
  modifiers: HotkeyModifiers,
): boolean {
  return (
    event.ctrlKey === modifiers.ctrl &&
    event.altKey === modifiers.alt &&
    event.shiftKey === modifiers.shift &&
    event.metaKey === modifiers.meta
  );
}

/**
 * Hook for detecting push-to-talk hotkey press/release.
 *
 * @param hotkey - Hotkey string like "ctrl+alt" or "ctrl+shift"
 * @param onPress - Called when hotkey is pressed
 * @param onRelease - Called when hotkey is released
 * @param enabled - Whether the hotkey listener is active (default: true)
 */
export function useHotkey(
  hotkey: string,
  onPress: () => void,
  onRelease: () => void,
  enabled: boolean = true,
): void {
  const isPressedRef = useRef(false);
  const modifiersRef = useRef<HotkeyModifiers>(parseHotkey(hotkey));

  // Use refs for callbacks to avoid stale closures in event handlers
  const onPressRef = useRef(onPress);
  const onReleaseRef = useRef(onRelease);
  onPressRef.current = onPress;
  onReleaseRef.current = onRelease;

  // Update modifiers when hotkey changes
  useEffect(() => {
    modifiersRef.current = parseHotkey(hotkey);
  }, [hotkey]);

  useEffect(() => {
    if (!enabled) {
      // If disabled while pressed, trigger release
      if (isPressedRef.current) {
        isPressedRef.current = false;
        onReleaseRef.current();
      }
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (matchesHotkey(event, modifiersRef.current) && !isPressedRef.current) {
        isPressedRef.current = true;
        event.preventDefault();
        onPressRef.current();
      }
    }

    function handleKeyUp(event: KeyboardEvent) {
      // Release when any required modifier is released
      if (isPressedRef.current && !matchesHotkey(event, modifiersRef.current)) {
        isPressedRef.current = false;
        onReleaseRef.current();
      }
    }

    function handleBlur() {
      // Release if window loses focus while hotkey is pressed
      if (isPressedRef.current) {
        isPressedRef.current = false;
        onReleaseRef.current();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    window.addEventListener("blur", handleBlur);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      window.removeEventListener("blur", handleBlur);
    };
  }, [enabled]);
}
