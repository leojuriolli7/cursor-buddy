import { describe, expect, it } from "vitest"
import { ProgressiveResponseProcessor } from "../utils/response-processor"

describe("ProgressiveResponseProcessor", () => {
  it("extracts text chunks from UI stream", () => {
    const processor = new ProgressiveResponseProcessor()

    // Each chunk needs a newline to trigger processing
    const firstChunk = processor.push(
      JSON.stringify({
        type: "text-delta",
        delta: "Click the ",
        id: "text-1",
      }) + "\n",
    )
    const secondChunk = processor.push(
      JSON.stringify({
        type: "text-delta",
        delta: "save button.",
        id: "text-1",
      }) + "\n",
    )
    const finalResult = processor.finish()

    expect(firstChunk.visibleText).toBe("Click the ")
    expect(secondChunk.visibleText).toBe("Click the save button.")
    expect(finalResult.finalResponseText).toBe("Click the save button.")
    expect(finalResult.speechSegments).toEqual(["Click the save button."])
  })

  it("captures point tool calls from UI stream", () => {
    const processor = new ProgressiveResponseProcessor()

    processor.push(
      JSON.stringify({
        type: "text-delta",
        delta: "Click the save button ",
        id: "text-1",
      }) + "\n",
    )
    processor.push(
      JSON.stringify({
        type: "tool-input-available",
        toolCallId: "call_1",
        toolName: "point",
        input: { type: "coordinates", x: 640, y: 360, label: "Save button" },
      }) + "\n",
    )
    const finalResult = processor.finish()

    expect(finalResult.finalResponseText).toBe("Click the save button")
    expect(finalResult.pointToolCall).toEqual({
      type: "coordinates",
      x: 640,
      y: 360,
      label: "Save button",
    })
  })

  it("holds very short sentences and combines them with the next stable segment", () => {
    const processor = new ProgressiveResponseProcessor()

    const firstChunk = processor.push(
      JSON.stringify({ type: "text-delta", delta: "Sure. ", id: "text-1" }) +
        "\n",
    )
    const secondChunk = processor.push(
      JSON.stringify({
        type: "text-delta",
        delta: "Click the primary save button now.",
        id: "text-1",
      }) + "\n",
    )

    expect(firstChunk.speechSegments).toEqual([])
    expect(secondChunk.speechSegments).toEqual([
      "Sure. Click the primary save button now.",
    ])
  })
})
