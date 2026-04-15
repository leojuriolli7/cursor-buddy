import type { PointToolInput } from "../../shared/point-tool"
import { isPointToolCall, parseUIStreamLine } from "./ui-stream-parser"

const COMMON_ABBREVIATIONS = [
  "mr.",
  "mrs.",
  "ms.",
  "dr.",
  "prof.",
  "sr.",
  "jr.",
  "e.g.",
  "i.e.",
]
const CLOSING_PUNCTUATION = new Set(['"', "'", "\u201D", "\u2019", ")", "]", "}"])
const SHORT_SEGMENT_THRESHOLD = 24

function isLikelySentenceBoundary(text: string, index: number): boolean {
  const char = text[index]
  if (char === "!" || char === "?" || char === "…" || char === "\n") {
    return true
  }

  if (char !== ".") return false

  const previousChar = text[index - 1] ?? ""
  const nextChar = text[index + 1] ?? ""

  if (/\d/.test(previousChar) && /\d/.test(nextChar)) {
    return false
  }

  const lookback = text.slice(Math.max(0, index - 10), index + 1).toLowerCase()
  if (
    COMMON_ABBREVIATIONS.some((abbreviation) => lookback.endsWith(abbreviation))
  ) {
    return false
  }

  return true
}

function findBoundaryEnd(text: string, start: number): number | null {
  for (let index = start; index < text.length; index++) {
    const char = text[index]

    if (char === "\n") {
      let end = index + 1
      while (end < text.length && /\s/.test(text[end] ?? "")) {
        end++
      }
      return end
    }

    if (!isLikelySentenceBoundary(text, index)) continue

    let end = index + 1
    while (end < text.length && CLOSING_PUNCTUATION.has(text[end] ?? "")) {
      end++
    }

    if (end < text.length) {
      const nextChar = text[end] ?? ""
      if (!/\s/.test(nextChar) && !/[A-Z0-9]/.test(nextChar)) {
        continue
      }
    }

    while (end < text.length && /\s/.test(text[end] ?? "")) {
      end++
    }

    return end
  }

  return null
}

function extractCompletedSegments(text: string): {
  consumedLength: number
  segments: string[]
} {
  const segments: string[] = []
  let consumedLength = 0

  while (consumedLength < text.length) {
    const boundaryEnd = findBoundaryEnd(text, consumedLength)
    if (boundaryEnd === null) break

    const segment = text.slice(consumedLength, boundaryEnd).trim()
    if (segment) {
      segments.push(segment)
    }

    consumedLength = boundaryEnd
  }

  return { consumedLength, segments }
}

export interface ProcessedResponseChunk {
  speechSegments: string[]
  visibleText: string
  pointToolCall: PointToolInput | null
}

export interface FinalProcessedResponse {
  finalResponseText: string
  speechSegments: string[]
  pointToolCall: PointToolInput | null
}

/**
 * Processes a streaming AI SDK UI message stream response.
 * Extracts text for display/TTS and captures point tool calls.
 */
export class ProgressiveResponseProcessor {
  private consumedTextLength = 0
  private pendingShortSegment = ""
  private rawText = ""
  private buffer = ""
  private pointToolCall: PointToolInput | null = null

  /**
   * Push raw stream data and extract text chunks and tool calls.
   * The UI message stream format is newline-delimited JSON.
   */
  push(chunk: string): ProcessedResponseChunk {
    this.buffer += chunk
    const lines = this.buffer.split("\n")

    // Keep incomplete last line in buffer
    this.buffer = lines.pop() ?? ""

    const newTextParts: string[] = []

    for (const line of lines) {
      const parsed = parseUIStreamLine(line)
      if (!parsed) continue

      if (parsed.type === "text-delta") {
        newTextParts.push(parsed.delta)
      } else if (isPointToolCall(parsed)) {
        // Capture first point tool call only
        if (!this.pointToolCall) {
          this.pointToolCall = parsed.input
        }
      }
    }

    // Accumulate new text
    if (newTextParts.length > 0) {
      this.rawText += newTextParts.join("")
    }

    // Extract completed sentences for TTS
    const unprocessedText = this.rawText.slice(this.consumedTextLength)
    const { consumedLength, segments } = extractCompletedSegments(unprocessedText)
    this.consumedTextLength += consumedLength

    return {
      visibleText: this.rawText,
      speechSegments: this.coalesceSegments(segments),
      pointToolCall: this.pointToolCall,
    }
  }

  /**
   * Finalize processing and return any remaining text/tool call.
   */
  finish(): FinalProcessedResponse {
    // Process any remaining buffer
    if (this.buffer) {
      const parsed = parseUIStreamLine(this.buffer)
      if (parsed?.type === "text-delta") {
        this.rawText += parsed.delta
      } else if (parsed && isPointToolCall(parsed) && !this.pointToolCall) {
        this.pointToolCall = parsed.input
      }
      this.buffer = ""
    }

    const trailingText = this.rawText.slice(this.consumedTextLength).trim()
    const finalSegmentParts = [this.pendingShortSegment, trailingText].filter(
      Boolean,
    )

    this.pendingShortSegment = ""

    return {
      finalResponseText: this.rawText.trim(),
      speechSegments: finalSegmentParts.length
        ? [finalSegmentParts.join(" ").trim()]
        : [],
      pointToolCall: this.pointToolCall,
    }
  }

  private coalesceSegments(segments: string[]): string[] {
    const speechSegments: string[] = []

    for (const segment of segments) {
      const normalizedSegment = segment.trim()
      if (!normalizedSegment) continue

      const candidate = this.pendingShortSegment
        ? `${this.pendingShortSegment} ${normalizedSegment}`
        : normalizedSegment

      if (candidate.length < SHORT_SEGMENT_THRESHOLD) {
        this.pendingShortSegment = candidate
        continue
      }

      this.pendingShortSegment = ""
      speechSegments.push(candidate)
    }

    return speechSegments
  }
}
