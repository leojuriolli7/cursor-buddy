import { describe, expect, it } from "vitest"
import {
  matchesHotkey,
  shouldReleaseModifierOnlyHotkey,
  isModifierReleased,
} from "../matcher"
import type { ParsedHotkey } from "../types"

// Helper to create a mock KeyboardEvent
function createKeyboardEvent(
  key: string,
  modifiers: {
    ctrl?: boolean
    alt?: boolean
    shift?: boolean
    meta?: boolean
  } = {},
): KeyboardEvent {
  return new KeyboardEvent("keydown", {
    key,
    ctrlKey: modifiers.ctrl ?? false,
    altKey: modifiers.alt ?? false,
    shiftKey: modifiers.shift ?? false,
    metaKey: modifiers.meta ?? false,
  })
}

describe("matchesHotkey", () => {
  describe("modifier-only hotkeys", () => {
    it("should match when all required modifiers are pressed", () => {
      const hotkey: ParsedHotkey = {
        key: null,
        ctrl: true,
        alt: true,
        shift: false,
        meta: false,
        isModifierOnly: true,
      }
      const event = createKeyboardEvent("k", { ctrl: true, alt: true })
      expect(matchesHotkey(event, hotkey)).toBe(true)
    })

    it("should match regardless of which key is pressed", () => {
      const hotkey: ParsedHotkey = {
        key: null,
        ctrl: true,
        alt: false,
        shift: false,
        meta: false,
        isModifierOnly: true,
      }
      // Any key should match as long as modifiers are held
      expect(
        matchesHotkey(createKeyboardEvent("a", { ctrl: true }), hotkey),
      ).toBe(true)
      expect(
        matchesHotkey(createKeyboardEvent("z", { ctrl: true }), hotkey),
      ).toBe(true)
      expect(
        matchesHotkey(createKeyboardEvent("Enter", { ctrl: true }), hotkey),
      ).toBe(true)
    })

    it("should not match when required modifier is missing", () => {
      const hotkey: ParsedHotkey = {
        key: null,
        ctrl: true,
        alt: true,
        shift: false,
        meta: false,
        isModifierOnly: true,
      }
      const event = createKeyboardEvent("k", { ctrl: true }) // missing alt
      expect(matchesHotkey(event, hotkey)).toBe(false)
    })

    it("should not match when no modifiers are pressed", () => {
      const hotkey: ParsedHotkey = {
        key: null,
        ctrl: true,
        alt: false,
        shift: false,
        meta: false,
        isModifierOnly: true,
      }
      const event = createKeyboardEvent("k")
      expect(matchesHotkey(event, hotkey)).toBe(false)
    })

    it("should match single modifier hotkey", () => {
      const hotkey: ParsedHotkey = {
        key: null,
        ctrl: true,
        alt: false,
        shift: false,
        meta: false,
        isModifierOnly: true,
      }
      const event = createKeyboardEvent("k", { ctrl: true })
      expect(matchesHotkey(event, hotkey)).toBe(true)
    })

    it("should match all modifiers hotkey", () => {
      const hotkey: ParsedHotkey = {
        key: null,
        ctrl: true,
        alt: true,
        shift: true,
        meta: true,
        isModifierOnly: true,
      }
      const event = createKeyboardEvent("k", {
        ctrl: true,
        alt: true,
        shift: true,
        meta: true,
      })
      expect(matchesHotkey(event, hotkey)).toBe(true)
    })
  })

  describe("modifier+key hotkeys", () => {
    it("should match ctrl+k", () => {
      const hotkey: ParsedHotkey = {
        key: "k",
        ctrl: true,
        alt: false,
        shift: false,
        meta: false,
        isModifierOnly: false,
      }
      const event = createKeyboardEvent("k", { ctrl: true })
      expect(matchesHotkey(event, hotkey)).toBe(true)
    })

    it("should match cmd+shift+a (case insensitive)", () => {
      const hotkey: ParsedHotkey = {
        key: "a",
        ctrl: false,
        alt: false,
        shift: true,
        meta: true,
        isModifierOnly: false,
      }
      const event = createKeyboardEvent("A", { shift: true, meta: true })
      expect(matchesHotkey(event, hotkey)).toBe(true)
    })

    it("should not match when key is different", () => {
      const hotkey: ParsedHotkey = {
        key: "k",
        ctrl: true,
        alt: false,
        shift: false,
        meta: false,
        isModifierOnly: false,
      }
      const event = createKeyboardEvent("j", { ctrl: true })
      expect(matchesHotkey(event, hotkey)).toBe(false)
    })

    it("should not match when modifier is missing", () => {
      const hotkey: ParsedHotkey = {
        key: "k",
        ctrl: true,
        alt: false,
        shift: false,
        meta: false,
        isModifierOnly: false,
      }
      const event = createKeyboardEvent("k") // no ctrl
      expect(matchesHotkey(event, hotkey)).toBe(false)
    })

    it("should match alt+f4", () => {
      const hotkey: ParsedHotkey = {
        key: "f4",
        ctrl: false,
        alt: true,
        shift: false,
        meta: false,
        isModifierOnly: false,
      }
      const event = createKeyboardEvent("f4", { alt: true })
      expect(matchesHotkey(event, hotkey)).toBe(true)
    })

    it("should match ctrl+alt+delete", () => {
      const hotkey: ParsedHotkey = {
        key: "delete",
        ctrl: true,
        alt: true,
        shift: false,
        meta: false,
        isModifierOnly: false,
      }
      const event = createKeyboardEvent("Delete", { ctrl: true, alt: true })
      expect(matchesHotkey(event, hotkey)).toBe(true)
    })
  })

  describe("key-only hotkeys", () => {
    it("should match escape key", () => {
      const hotkey: ParsedHotkey = {
        key: "escape",
        ctrl: false,
        alt: false,
        shift: false,
        meta: false,
        isModifierOnly: false,
      }
      const event = createKeyboardEvent("Escape")
      expect(matchesHotkey(event, hotkey)).toBe(true)
    })

    it("should match f1 key", () => {
      const hotkey: ParsedHotkey = {
        key: "f1",
        ctrl: false,
        alt: false,
        shift: false,
        meta: false,
        isModifierOnly: false,
      }
      const event = createKeyboardEvent("f1")
      expect(matchesHotkey(event, hotkey)).toBe(true)
    })

    it("should not match when modifiers are pressed for key-only hotkey", () => {
      const hotkey: ParsedHotkey = {
        key: "escape",
        ctrl: false,
        alt: false,
        shift: false,
        meta: false,
        isModifierOnly: false,
      }
      const event = createKeyboardEvent("Escape", { ctrl: true })
      expect(matchesHotkey(event, hotkey)).toBe(false)
    })
  })

  describe("edge cases", () => {
    it("should be case insensitive for keys", () => {
      const hotkey: ParsedHotkey = {
        key: "a",
        ctrl: true,
        alt: false,
        shift: false,
        meta: false,
        isModifierOnly: false,
      }
      const event = createKeyboardEvent("A", { ctrl: true })
      expect(matchesHotkey(event, hotkey)).toBe(true)
    })

    it("should handle special keys like Enter", () => {
      const hotkey: ParsedHotkey = {
        key: "enter",
        ctrl: true,
        alt: false,
        shift: false,
        meta: false,
        isModifierOnly: false,
      }
      const event = createKeyboardEvent("Enter", { ctrl: true })
      expect(matchesHotkey(event, hotkey)).toBe(true)
    })

    it("should handle space key", () => {
      const hotkey: ParsedHotkey = {
        key: " ",
        ctrl: true,
        alt: false,
        shift: false,
        meta: false,
        isModifierOnly: false,
      }
      const event = createKeyboardEvent(" ", { ctrl: true })
      expect(matchesHotkey(event, hotkey)).toBe(true)
    })
  })
})

describe("shouldReleaseModifierOnlyHotkey", () => {
  it("should return true when ctrl is released", () => {
    const hotkey: ParsedHotkey = {
      key: null,
      ctrl: true,
      alt: false,
      shift: false,
      meta: false,
      isModifierOnly: true,
    }
    // Simulating keyup when ctrl is no longer pressed
    const event = new KeyboardEvent("keyup", {
      key: "Control",
      ctrlKey: false,
    })
    expect(shouldReleaseModifierOnlyHotkey(event, hotkey)).toBe(true)
  })

  it("should return true when any required modifier is released", () => {
    const hotkey: ParsedHotkey = {
      key: null,
      ctrl: true,
      alt: true,
      shift: false,
      meta: false,
      isModifierOnly: true,
    }
    // Alt released, but ctrl still held
    const event = new KeyboardEvent("keyup", {
      key: "Alt",
      ctrlKey: true,
      altKey: false,
    })
    expect(shouldReleaseModifierOnlyHotkey(event, hotkey)).toBe(true)
  })

  it("should return false when all required modifiers are still held", () => {
    const hotkey: ParsedHotkey = {
      key: null,
      ctrl: true,
      alt: true,
      shift: false,
      meta: false,
      isModifierOnly: true,
    }
    // Some other key released, but modifiers still held
    const event = new KeyboardEvent("keyup", {
      key: "k",
      ctrlKey: true,
      altKey: true,
    })
    expect(shouldReleaseModifierOnlyHotkey(event, hotkey)).toBe(false)
  })

  it("should return false for non-modifier-only hotkeys", () => {
    const hotkey: ParsedHotkey = {
      key: "k",
      ctrl: true,
      alt: false,
      shift: false,
      meta: false,
      isModifierOnly: false,
    }
    const event = new KeyboardEvent("keyup", {
      key: "Control",
      ctrlKey: false,
    })
    expect(shouldReleaseModifierOnlyHotkey(event, hotkey)).toBe(false)
  })
})

describe("isModifierReleased", () => {
  it("should detect Control release", () => {
    const event = new KeyboardEvent("keyup", { key: "Control" })
    expect(isModifierReleased(event)).toBe(true)
  })

  it("should detect Alt release", () => {
    const event = new KeyboardEvent("keyup", { key: "Alt" })
    expect(isModifierReleased(event)).toBe(true)
  })

  it("should detect Shift release", () => {
    const event = new KeyboardEvent("keyup", { key: "Shift" })
    expect(isModifierReleased(event)).toBe(true)
  })

  it("should detect Meta release", () => {
    const event = new KeyboardEvent("keyup", { key: "Meta" })
    expect(isModifierReleased(event)).toBe(true)
  })

  it("should detect Command release (as meta)", () => {
    const event = new KeyboardEvent("keyup", { key: "Command" })
    expect(isModifierReleased(event)).toBe(true)
  })

  it("should detect Cmd release (as meta)", () => {
    const event = new KeyboardEvent("keyup", { key: "Cmd" })
    expect(isModifierReleased(event)).toBe(true)
  })

  it("should detect OS release (as meta)", () => {
    const event = new KeyboardEvent("keyup", { key: "OS" })
    expect(isModifierReleased(event)).toBe(true)
  })

  it("should return false for regular keys", () => {
    const event = new KeyboardEvent("keyup", { key: "k" })
    expect(isModifierReleased(event)).toBe(false)
  })

  it("should return false for escape key", () => {
    const event = new KeyboardEvent("keyup", { key: "Escape" })
    expect(isModifierReleased(event)).toBe(false)
  })
})
