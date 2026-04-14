import { describe, expect, it } from "vitest"
import {
  parsePointingTagRaw,
  stripPointingTag,
  stripTrailingPointingSyntax,
} from "../pointing"

describe("parsePointingTagRaw", () => {
  describe("marker-based pointing", () => {
    it("parses marker ID format [POINT:5:label]", () => {
      const response = "Click this button [POINT:5:Submit]"
      const result = parsePointingTagRaw(response)

      expect(result).toEqual({
        type: "marker",
        markerId: 5,
        label: "Submit",
      })
    })

    it("parses single digit marker", () => {
      const response = "Here [POINT:1:First]"
      const result = parsePointingTagRaw(response)

      expect(result).toEqual({
        type: "marker",
        markerId: 1,
        label: "First",
      })
    })

    it("parses multi-digit marker", () => {
      const response = "Element [POINT:42:Item]"
      const result = parsePointingTagRaw(response)

      expect(result).toEqual({
        type: "marker",
        markerId: 42,
        label: "Item",
      })
    })
  })

  describe("coordinate-based pointing", () => {
    it("parses coordinate format [POINT:640,360:label]", () => {
      const response = "The text is here [POINT:640,360:Error message]"
      const result = parsePointingTagRaw(response)

      expect(result).toEqual({
        type: "coordinates",
        x: 640,
        y: 360,
        label: "Error message",
      })
    })

    it("parses zero coordinates", () => {
      const response = "Top left [POINT:0,0:Origin]"
      const result = parsePointingTagRaw(response)

      expect(result).toEqual({
        type: "coordinates",
        x: 0,
        y: 0,
        label: "Origin",
      })
    })

    it("parses large coordinates", () => {
      const response = "Corner [POINT:1920,1080:Bottom right]"
      const result = parsePointingTagRaw(response)

      expect(result).toEqual({
        type: "coordinates",
        x: 1920,
        y: 1080,
        label: "Bottom right",
      })
    })
  })

  describe("edge cases", () => {
    it("returns null for no tag", () => {
      expect(parsePointingTagRaw("Just text")).toBeNull()
    })

    it("returns null for tag not at end", () => {
      expect(parsePointingTagRaw("[POINT:5:Label] more text")).toBeNull()
    })

    it("handles trailing whitespace", () => {
      const result = parsePointingTagRaw("Text [POINT:3:Button]   ")
      expect(result).toEqual({
        type: "marker",
        markerId: 3,
        label: "Button",
      })
    })

    it("trims label whitespace", () => {
      const result = parsePointingTagRaw("Text [POINT:5:  Padded  ]")
      expect(result?.label).toBe("Padded")
    })
  })
})

describe("stripPointingTag", () => {
  it("removes coordinate POINT tag from response", () => {
    const response = "Click the submit button [POINT:150,200:Submit Button]"
    expect(stripPointingTag(response)).toBe("Click the submit button")
  })

  it("removes marker POINT tag from response", () => {
    const response = "Click this button [POINT:5:Submit]"
    expect(stripPointingTag(response)).toBe("Click this button")
  })

  it("preserves response without POINT tag", () => {
    const response = "Some regular response text."
    expect(stripPointingTag(response)).toBe("Some regular response text.")
  })

  it("trims resulting text", () => {
    const response = "  Click here   [POINT:50,75:Link]  "
    expect(stripPointingTag(response)).toBe("Click here")
  })

  it("handles empty response after tag removal", () => {
    const response = "[POINT:100,200:Just Tag]"
    expect(stripPointingTag(response)).toBe("")
  })

  it("only removes tag at end, preserves other brackets", () => {
    const response = "Array [1, 2, 3] button [POINT:100,200:Button]"
    expect(stripPointingTag(response)).toBe("Array [1, 2, 3] button")
  })

  it("handles multiline response", () => {
    const response = "Line 1\nLine 2\nClick here [POINT:100,200:Button]"
    expect(stripPointingTag(response)).toBe("Line 1\nLine 2\nClick here")
  })
})

describe("stripTrailingPointingSyntax", () => {
  it("removes partial trailing POINT prefixes while streaming", () => {
    expect(stripTrailingPointingSyntax("Click here [POI")).toBe("Click here")
  })

  it("removes an unfinished trailing POINT tag body", () => {
    expect(stripTrailingPointingSyntax("Click here [POINT:5:Submit")).toBe(
      "Click here",
    )
  })
})
