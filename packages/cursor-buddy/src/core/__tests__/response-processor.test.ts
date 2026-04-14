import { describe, expect, it } from "vitest"
import { ProgressiveResponseProcessor } from "../utils/response-processor"

describe("ProgressiveResponseProcessor", () => {
  it("suppresses partial trailing POINT fragments in the visible text", () => {
    const processor = new ProgressiveResponseProcessor()

    const firstChunk = processor.push("Click the save button ")
    const secondChunk = processor.push("[POI")
    const thirdChunk = processor.push("NT:5:Save]")
    const finalResult = processor.finish()

    expect(firstChunk.visibleText).toBe("Click the save button")
    expect(secondChunk.visibleText).toBe("Click the save button")
    expect(thirdChunk.visibleText).toBe("Click the save button")
    expect(finalResult.finalResponseText).toBe("Click the save button")
    expect(finalResult.speechSegments).toEqual(["Click the save button"])
  })

  it("holds very short sentences and combines them with the next stable segment", () => {
    const processor = new ProgressiveResponseProcessor()

    const firstChunk = processor.push("Sure. ")
    const secondChunk = processor.push("Click the primary save button now.")

    expect(firstChunk.speechSegments).toEqual([])
    expect(secondChunk.speechSegments).toEqual([
      "Sure. Click the primary save button now.",
    ])
  })
})
