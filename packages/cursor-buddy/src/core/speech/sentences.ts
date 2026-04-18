const CLOSING_PUNCTUATION = new Set([
  '"',
  "'",
  "\u201D",
  "\u2019",
  ")",
  "]",
  "}",
])

const SHORT_SEGMENT_THRESHOLD = 24

function isLikelySentenceBoundary(text: string, index: number): boolean {
  const char = text[index]
  if (char === "!" || char === "?" || char === "\u2026" || char === "\n") {
    return true
  }

  if (char !== ".") return false

  const previousChar = text[index - 1] ?? ""
  const nextChar = text[index + 1] ?? ""

  // Decimal numbers
  if (/\d/.test(previousChar) && /\d/.test(nextChar)) {
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

    // Only treat as boundary if followed by whitespace or end of text
    if (end < text.length && !/\s/.test(text[end] ?? "")) {
      continue
    }

    while (end < text.length && /\s/.test(text[end] ?? "")) {
      end++
    }

    return end
  }

  return null
}

/**
 * Extract completed sentences from text.
 * Returns the consumed length and extracted segments.
 */
export function extractCompletedSentences(text: string): {
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

/**
 * Buffer that accumulates text and emits complete sentences for TTS.
 * Coalesces short segments to avoid choppy speech.
 */
export class SentenceBuffer {
  private text = ""
  private consumedLength = 0
  private pendingShortSegment = ""

  /**
   * Add text to the buffer and extract any complete sentences.
   */
  push(delta: string): string[] {
    this.text += delta

    const unprocessedText = this.text.slice(this.consumedLength)
    const { consumedLength, segments } =
      extractCompletedSentences(unprocessedText)
    this.consumedLength += consumedLength

    return this.coalesceSegments(segments)
  }

  /**
   * Flush any remaining text as a final segment.
   */
  flush(): string {
    const trailingText = this.text.slice(this.consumedLength).trim()
    const finalParts = [this.pendingShortSegment, trailingText].filter(Boolean)

    this.pendingShortSegment = ""
    this.text = ""
    this.consumedLength = 0

    return finalParts.length ? finalParts.join(" ").trim() : ""
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
