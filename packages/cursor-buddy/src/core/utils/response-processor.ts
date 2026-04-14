import { stripPointingTag, stripTrailingPointingSyntax } from "../pointing"

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
const CLOSING_PUNCTUATION = new Set(['"', "'", "”", "’", ")", "]", "}"])
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
}

export interface FinalProcessedResponse {
  finalResponseText: string
  fullResponse: string
  speechSegments: string[]
}

/**
 * Tracks a streaming assistant response, exposes a tag-free visible version for
 * the UI, and emits speakable segments as sentence boundaries become stable.
 */
export class ProgressiveResponseProcessor {
  private consumedVisibleTextLength = 0
  private pendingShortSegment = ""
  private rawResponse = ""

  push(chunk: string): ProcessedResponseChunk {
    this.rawResponse += chunk

    const visibleText = stripTrailingPointingSyntax(this.rawResponse)
    const unprocessedText = visibleText.slice(this.consumedVisibleTextLength)
    const { consumedLength, segments } =
      extractCompletedSegments(unprocessedText)

    this.consumedVisibleTextLength += consumedLength

    return {
      visibleText,
      speechSegments: this.coalesceSegments(segments),
    }
  }

  finish(): FinalProcessedResponse {
    const finalResponseText = stripPointingTag(this.rawResponse)
    const trailingText = finalResponseText
      .slice(this.consumedVisibleTextLength)
      .trim()

    const finalSegmentParts = [this.pendingShortSegment, trailingText].filter(
      Boolean,
    )

    this.pendingShortSegment = ""

    return {
      fullResponse: this.rawResponse,
      finalResponseText,
      speechSegments: finalSegmentParts.length
        ? [finalSegmentParts.join(" ").trim()]
        : [],
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
