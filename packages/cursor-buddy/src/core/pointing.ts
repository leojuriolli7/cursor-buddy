import type { ParsedPointingTag } from "./types"

/**
 * Parses POINT tags from AI responses.
 *
 * Supports two formats:
 * - Marker-based: [POINT:5:label] - 3 parts, references a numbered marker
 * - Coordinate-based: [POINT:640,360:label] - 4 parts, raw pixel coordinates
 */

// Matches both formats: [POINT:5:label] or [POINT:640,360:label]
const POINTING_TAG_REGEX = /\[POINT:(\d+)(?:,(\d+))?:([^\]]+)\]\s*$/
const PARTIAL_POINTING_PREFIXES = new Set([
  "[",
  "[P",
  "[PO",
  "[POI",
  "[POIN",
  "[POINT",
  "[POINT:",
])

function stripTrailingPointingTag(
  response: string,
  trimResult: boolean,
): string {
  const stripped = response.replace(POINTING_TAG_REGEX, "")
  return trimResult ? stripped.trim() : stripped
}

function getPartialPointingTagStart(response: string): number {
  const lastOpenBracket = response.lastIndexOf("[")
  if (lastOpenBracket === -1) return -1

  const suffix = response.slice(lastOpenBracket).trimEnd()

  if (suffix.includes("]")) return -1
  if (suffix.startsWith("[POINT:")) {
    let start = lastOpenBracket
    while (start > 0 && /\s/.test(response[start - 1] ?? "")) {
      start--
    }
    return start
  }

  return PARTIAL_POINTING_PREFIXES.has(suffix) ? lastOpenBracket : -1
}

/**
 * Parse pointing tag into structured result.
 * Returns null if no valid POINT tag is found at the end.
 */
export function parsePointingTagRaw(
  response: string,
): ParsedPointingTag | null {
  const match = response.match(POINTING_TAG_REGEX)
  if (!match) return null

  const first = Number.parseInt(match[1], 10)
  const second = match[2] ? Number.parseInt(match[2], 10) : null
  const label = match[3].trim()

  if (second !== null) {
    // Coordinate format: [POINT:x,y:label]
    return { type: "coordinates", x: first, y: second, label }
  }
  // Marker format: [POINT:id:label]
  return { type: "marker", markerId: first, label }
}

/**
 * Remove POINT tag from response text for display/TTS.
 */
export function stripPointingTag(response: string): string {
  return stripTrailingPointingTag(response, true)
}

/**
 * Strip complete or partial trailing POINT syntax while the response streams.
 * This keeps the visible text and TTS input stable even if the tag arrives
 * incrementally over multiple chunks.
 */
export function stripTrailingPointingSyntax(response: string): string {
  const withoutCompleteTag = stripTrailingPointingTag(response, false)
  const partialTagStart = getPartialPointingTagStart(withoutCompleteTag)

  if (partialTagStart === -1) {
    return withoutCompleteTag.trimEnd()
  }

  return withoutCompleteTag.slice(0, partialTagStart).trimEnd()
}
