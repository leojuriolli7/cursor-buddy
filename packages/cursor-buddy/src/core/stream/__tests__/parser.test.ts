import { describe, expect, it } from "vitest"
import { parseStreamBuffer, parseStreamLine } from "../parser"

describe("parseStreamLine", () => {
  it("parses text-delta", () => {
    const result = parseStreamLine('data: {"type":"text-delta","delta":"Hello"}')
    expect(result).toEqual({
      type: "text-delta",
      delta: "Hello",
    })
  })

  it("parses tool-call", () => {
    const result = parseStreamLine(
      'data: {"type":"tool-call","toolCallId":"tc-1","toolName":"point","args":{"elementId":5}}',
    )
    expect(result).toEqual({
      type: "tool-call",
      toolCallId: "tc-1",
      toolName: "point",
      args: { elementId: 5 },
    })
  })

  it("parses tool-input-available as tool-call", () => {
    const result = parseStreamLine(
      'data: {"type":"tool-input-available","toolCallId":"ws-1","toolName":"web_search","input":{},"providerExecuted":true}',
    )
    expect(result).toEqual({
      type: "tool-call",
      toolCallId: "ws-1",
      toolName: "web_search",
      args: {},
    })
  })

  it("parses tool-output-available as tool-result", () => {
    const result = parseStreamLine(
      'data: {"type":"tool-output-available","toolCallId":"ws-1","output":{"sources":["url1"]},"providerExecuted":true}',
    )
    expect(result).toEqual({
      type: "tool-result",
      toolCallId: "ws-1",
      result: { sources: ["url1"] },
    })
  })

  it("parses tool-result", () => {
    const result = parseStreamLine(
      'data: {"type":"tool-result","toolCallId":"tc-1","result":{"success":true}}',
    )
    expect(result).toEqual({
      type: "tool-result",
      toolCallId: "tc-1",
      result: { success: true },
    })
  })

  it("parses tool-result-error", () => {
    const result = parseStreamLine(
      'data: {"type":"tool-result-error","toolCallId":"tc-1","error":"Failed"}',
    )
    expect(result).toEqual({
      type: "tool-result-error",
      toolCallId: "tc-1",
      error: "Failed",
    })
  })

  it("parses tool-approval-request", () => {
    const result = parseStreamLine(
      'data: {"type":"tool-approval-request","approvalId":"ap-1","toolCallId":"tc-1","toolName":"delete","args":{}}',
    )
    expect(result).toEqual({
      type: "tool-approval-request",
      approvalId: "ap-1",
      toolCallId: "tc-1",
      toolName: "delete",
      args: {},
    })
  })

  it("parses finish", () => {
    const result = parseStreamLine('data: {"type":"finish"}')
    expect(result).toEqual({ type: "finish" })
  })

  it("parses error", () => {
    const result = parseStreamLine(
      'data: {"type":"error","errorText":"Something went wrong"}',
    )
    expect(result).toEqual({
      type: "error",
      errorText: "Something went wrong",
    })
  })

  it("returns null for empty lines", () => {
    expect(parseStreamLine("")).toBeNull()
    expect(parseStreamLine("   ")).toBeNull()
  })

  it("returns null for [DONE] marker", () => {
    expect(parseStreamLine("data: [DONE]")).toBeNull()
  })

  it("returns unknown for unrecognized types", () => {
    const result = parseStreamLine('data: {"type":"some-other-type"}')
    expect(result).toEqual({ type: "unknown" })
  })

  it("handles lines without data: prefix", () => {
    const result = parseStreamLine('{"type":"text-delta","delta":"Hi"}')
    expect(result).toEqual({
      type: "text-delta",
      delta: "Hi",
    })
  })
})

describe("parseStreamBuffer", () => {
  it("parses multiple complete lines", () => {
    const buffer = 'data: {"type":"text-delta","delta":"A"}\ndata: {"type":"text-delta","delta":"B"}\n'
    const { chunks, remainder } = parseStreamBuffer(buffer)

    expect(chunks).toHaveLength(2)
    expect(chunks[0]).toEqual({ type: "text-delta", delta: "A" })
    expect(chunks[1]).toEqual({ type: "text-delta", delta: "B" })
    expect(remainder).toBe("")
  })

  it("preserves incomplete line as remainder", () => {
    const buffer = 'data: {"type":"text-delta","delta":"A"}\ndata: {"type":"text-del'
    const { chunks, remainder } = parseStreamBuffer(buffer)

    expect(chunks).toHaveLength(1)
    expect(chunks[0]).toEqual({ type: "text-delta", delta: "A" })
    expect(remainder).toBe('data: {"type":"text-del')
  })

  it("handles empty buffer", () => {
    const { chunks, remainder } = parseStreamBuffer("")
    expect(chunks).toHaveLength(0)
    expect(remainder).toBe("")
  })

  it("filters out null results from empty lines", () => {
    const buffer = 'data: {"type":"text-delta","delta":"X"}\n\n\ndata: {"type":"finish"}\n'
    const { chunks } = parseStreamBuffer(buffer)

    expect(chunks).toHaveLength(2)
    expect(chunks[0].type).toBe("text-delta")
    expect(chunks[1].type).toBe("finish")
  })
})
