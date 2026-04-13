import { describe, expect, it } from "vitest"
import { parsePointingTag, stripPointingTag } from "../pointing"

describe("parsePointingTag", () => {
  it("parses valid POINT tag at end of response", () => {
    const response = "Click the submit button [POINT:150,200:Submit Button]"
    const result = parsePointingTag(response)

    expect(result).toEqual({
      x: 150,
      y: 200,
      label: "Submit Button",
    })
  })

  it("returns null for response without POINT tag", () => {
    const response = "Here is some text without any pointing."
    expect(parsePointingTag(response)).toBeNull()
  })

  it("returns null for POINT tag not at end of response", () => {
    const response = "[POINT:100,200:Button] Some text after"
    expect(parsePointingTag(response)).toBeNull()
  })

  it("handles POINT tag with trailing whitespace", () => {
    const response = "Click here [POINT:50,75:Link]   "
    const result = parsePointingTag(response)

    expect(result).toEqual({
      x: 50,
      y: 75,
      label: "Link",
    })
  })

  it("parses large coordinates", () => {
    const response = "Far element [POINT:1920,1080:Corner]"
    const result = parsePointingTag(response)

    expect(result).toEqual({
      x: 1920,
      y: 1080,
      label: "Corner",
    })
  })

  it("parses zero coordinates", () => {
    const response = "Top left [POINT:0,0:Origin]"
    const result = parsePointingTag(response)

    expect(result).toEqual({
      x: 0,
      y: 0,
      label: "Origin",
    })
  })

  it("trims whitespace from label", () => {
    const response = "Button [POINT:100,100:  Padded Label  ]"
    const result = parsePointingTag(response)

    expect(result?.label).toBe("Padded Label")
  })

  it("rejects negative coordinates", () => {
    const response = "Invalid [POINT:-10,20:Negative]"
    expect(parsePointingTag(response)).toBeNull()
  })

  it("rejects non-numeric coordinates", () => {
    const response = "Invalid [POINT:abc,100:Text]"
    expect(parsePointingTag(response)).toBeNull()
  })

  it("rejects malformed tag (missing colon)", () => {
    const response = "Invalid [POINT:100200:NoComma]"
    expect(parsePointingTag(response)).toBeNull()
  })

  it("rejects empty label", () => {
    const response = "Empty [POINT:100,200:]"
    // Regex requires at least one character in label
    expect(parsePointingTag(response)).toBeNull()
  })
})

describe("stripPointingTag", () => {
  it("removes POINT tag from response", () => {
    const response = "Click the submit button [POINT:150,200:Submit Button]"
    expect(stripPointingTag(response)).toBe("Click the submit button")
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
