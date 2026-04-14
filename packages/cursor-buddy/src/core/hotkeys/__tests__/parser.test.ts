import { describe, expect, it } from "vitest"
import { parseHotkey, parseKeyboardEvent, formatHotkey } from "../parser"

describe("parseHotkey", () => {
  describe("modifier-only hotkeys", () => {
    it("should parse single modifier 'ctrl'", () => {
      const result = parseHotkey("ctrl")
      expect(result).toEqual({
        key: null,
        ctrl: true,
        alt: false,
        shift: false,
        meta: false,
        isModifierOnly: true,
      })
    })

    it("should parse single modifier 'alt'", () => {
      const result = parseHotkey("alt")
      expect(result).toEqual({
        key: null,
        ctrl: false,
        alt: true,
        shift: false,
        meta: false,
        isModifierOnly: true,
      })
    })

    it("should parse single modifier 'shift'", () => {
      const result = parseHotkey("shift")
      expect(result).toEqual({
        key: null,
        ctrl: false,
        alt: false,
        shift: true,
        meta: false,
        isModifierOnly: true,
      })
    })

    it("should parse single modifier 'meta'", () => {
      const result = parseHotkey("meta")
      expect(result).toEqual({
        key: null,
        ctrl: false,
        alt: false,
        shift: false,
        meta: true,
        isModifierOnly: true,
      })
    })

    it("should parse two modifiers 'ctrl+alt'", () => {
      const result = parseHotkey("ctrl+alt")
      expect(result).toEqual({
        key: null,
        ctrl: true,
        alt: true,
        shift: false,
        meta: false,
        isModifierOnly: true,
      })
    })

    it("should parse two modifiers 'cmd+shift' (cmd as meta)", () => {
      const result = parseHotkey("cmd+shift")
      expect(result).toEqual({
        key: null,
        ctrl: false,
        alt: false,
        shift: true,
        meta: true,
        isModifierOnly: true,
      })
    })

    it("should parse all modifiers 'ctrl+alt+shift+meta'", () => {
      const result = parseHotkey("ctrl+alt+shift+meta")
      expect(result).toEqual({
        key: null,
        ctrl: true,
        alt: true,
        shift: true,
        meta: true,
        isModifierOnly: true,
      })
    })
  })

  describe("modifier aliases", () => {
    it("should parse 'control' as ctrl", () => {
      const result = parseHotkey("control")
      expect(result.ctrl).toBe(true)
      expect(result.isModifierOnly).toBe(true)
    })

    it("should parse 'command' as meta", () => {
      const result = parseHotkey("command")
      expect(result.meta).toBe(true)
      expect(result.isModifierOnly).toBe(true)
    })

    it("should parse 'cmd' as meta", () => {
      const result = parseHotkey("cmd")
      expect(result.meta).toBe(true)
      expect(result.isModifierOnly).toBe(true)
    })

    it("should parse 'option' as alt", () => {
      const result = parseHotkey("option")
      expect(result.alt).toBe(true)
      expect(result.isModifierOnly).toBe(true)
    })
  })

  describe("modifier+key hotkeys", () => {
    it("should parse 'ctrl+k'", () => {
      const result = parseHotkey("ctrl+k")
      expect(result).toEqual({
        key: "k",
        ctrl: true,
        alt: false,
        shift: false,
        meta: false,
        isModifierOnly: false,
      })
    })

    it("should parse 'cmd+shift+a'", () => {
      const result = parseHotkey("cmd+shift+a")
      expect(result).toEqual({
        key: "a",
        ctrl: false,
        alt: false,
        shift: true,
        meta: true,
        isModifierOnly: false,
      })
    })

    it("should parse 'alt+f4'", () => {
      const result = parseHotkey("alt+f4")
      expect(result).toEqual({
        key: "f4",
        ctrl: false,
        alt: true,
        shift: false,
        meta: false,
        isModifierOnly: false,
      })
    })

    it("should parse 'ctrl+alt+delete'", () => {
      const result = parseHotkey("ctrl+alt+delete")
      expect(result).toEqual({
        key: "delete",
        ctrl: true,
        alt: true,
        shift: false,
        meta: false,
        isModifierOnly: false,
      })
    })

    it("should parse 'ctrl+shift+escape'", () => {
      const result = parseHotkey("ctrl+shift+escape")
      expect(result).toEqual({
        key: "escape",
        ctrl: true,
        alt: false,
        shift: true,
        meta: false,
        isModifierOnly: false,
      })
    })
  })

  describe("key-only hotkeys", () => {
    it("should parse 'escape'", () => {
      const result = parseHotkey("escape")
      expect(result).toEqual({
        key: "escape",
        ctrl: false,
        alt: false,
        shift: false,
        meta: false,
        isModifierOnly: false,
      })
    })

    it("should parse 'f1'", () => {
      const result = parseHotkey("f1")
      expect(result).toEqual({
        key: "f1",
        ctrl: false,
        alt: false,
        shift: false,
        meta: false,
        isModifierOnly: false,
      })
    })

    it("should parse 'a'", () => {
      const result = parseHotkey("a")
      expect(result).toEqual({
        key: "a",
        ctrl: false,
        alt: false,
        shift: false,
        meta: false,
        isModifierOnly: false,
      })
    })

    it("should normalize uppercase keys to lowercase", () => {
      const result = parseHotkey("A")
      expect(result.key).toBe("a")
    })

    it("should parse 'enter'", () => {
      const result = parseHotkey("enter")
      expect(result.key).toBe("enter")
      expect(result.isModifierOnly).toBe(false)
    })
  })

  describe("case insensitivity", () => {
    it("should handle uppercase modifiers", () => {
      const result = parseHotkey("CTRL+K")
      expect(result.ctrl).toBe(true)
      expect(result.key).toBe("k")
    })

    it("should handle mixed case", () => {
      const result = parseHotkey("Cmd+Shift+A")
      expect(result.meta).toBe(true)
      expect(result.shift).toBe(true)
      expect(result.key).toBe("a")
    })
  })

  describe("whitespace handling", () => {
    it("should handle spaces around '+'", () => {
      const result = parseHotkey("ctrl + k")
      expect(result.ctrl).toBe(true)
      expect(result.key).toBe("k")
    })

    it("should handle multiple spaces", () => {
      const result = parseHotkey("  ctrl  +  alt  +  k  ")
      expect(result.ctrl).toBe(true)
      expect(result.alt).toBe(true)
      expect(result.key).toBe("k")
    })
  })

  describe("special key aliases", () => {
    it("should normalize 'esc' to 'escape'", () => {
      const result = parseHotkey("esc")
      expect(result.key).toBe("escape")
    })

    it("should normalize 'del' to 'delete'", () => {
      const result = parseHotkey("del")
      expect(result.key).toBe("delete")
    })

    it("should normalize 'space' to ' '", () => {
      const result = parseHotkey("space")
      expect(result.key).toBe(" ")
    })

    it("should normalize 'spacebar' to ' '", () => {
      const result = parseHotkey("spacebar")
      expect(result.key).toBe(" ")
    })
  })
})

describe("parseKeyboardEvent", () => {
  it("should parse event with ctrl+k", () => {
    const event = new KeyboardEvent("keydown", {
      key: "k",
      ctrlKey: true,
    })
    const result = parseKeyboardEvent(event)
    expect(result).toEqual({
      key: "k",
      ctrl: true,
      alt: false,
      shift: false,
      meta: false,
      isModifierOnly: false,
    })
  })

  it("should parse event with meta+shift (modifier only)", () => {
    const event = new KeyboardEvent("keydown", {
      key: "Shift",
      metaKey: true,
      shiftKey: true,
    })
    const result = parseKeyboardEvent(event)
    expect(result).toEqual({
      key: null,
      ctrl: false,
      alt: false,
      shift: true,
      meta: true,
      isModifierOnly: true,
    })
  })

  it("should parse event with escape key (no modifiers)", () => {
    const event = new KeyboardEvent("keydown", {
      key: "Escape",
    })
    const result = parseKeyboardEvent(event)
    expect(result).toEqual({
      key: "escape",
      ctrl: false,
      alt: false,
      shift: false,
      meta: false,
      isModifierOnly: false,
    })
  })

  it("should treat modifier key as modifier-only", () => {
    const event = new KeyboardEvent("keydown", {
      key: "Control",
      ctrlKey: true,
    })
    const result = parseKeyboardEvent(event)
    expect(result.isModifierOnly).toBe(true)
    expect(result.key).toBe(null)
  })
})

describe("formatHotkey", () => {
  it("should format modifier-only hotkey", () => {
    const formatted = formatHotkey({
      key: null,
      ctrl: true,
      alt: true,
      shift: false,
      meta: false,
      isModifierOnly: true,
    })
    expect(formatted).toBe("ctrl+alt")
  })

  it("should format modifier+key hotkey", () => {
    const formatted = formatHotkey({
      key: "k",
      ctrl: true,
      alt: false,
      shift: false,
      meta: false,
      isModifierOnly: false,
    })
    expect(formatted).toBe("ctrl+k")
  })

  it("should format key-only hotkey", () => {
    const formatted = formatHotkey({
      key: "escape",
      ctrl: false,
      alt: false,
      shift: false,
      meta: false,
      isModifierOnly: false,
    })
    expect(formatted).toBe("escape")
  })

  it("should format all modifiers", () => {
    const formatted = formatHotkey({
      key: "a",
      ctrl: true,
      alt: true,
      shift: true,
      meta: true,
      isModifierOnly: false,
    })
    expect(formatted).toBe("ctrl+alt+shift+meta+a")
  })
})
