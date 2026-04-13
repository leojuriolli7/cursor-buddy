import type { PointingTarget, ParsedPointingTag } from "./types"

/**
 * Parses POINT tags from AI responses.
 *
 * Supports two formats:
 * - Marker-based: [POINT:5:label] - 3 parts, references a numbered marker
 * - Coordinate-based: [POINT:640,360:label] - 4 parts, raw pixel coordinates
 */

// Matches both formats: [POINT:5:label] or [POINT:640,360:label]
const POINTING_TAG_REGEX = /\[POINT:(\d+)(?:,(\d+))?:([^\]]+)\]\s*$/

/**
 * Parse pointing tag into structured result.
 * Returns null if no valid POINT tag is found at the end.
 */
export function parsePointingTagRaw(response: string): ParsedPointingTag | null {
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
 * Extract pointing target from response text.
 * For marker-based pointing, returns null (needs resolution via marker map).
 * For coordinate-based pointing, returns the target directly.
 *
 * @deprecated Use parsePointingTagRaw for full marker support
 */
export function parsePointingTag(response: string): PointingTarget | null {
  const parsed = parsePointingTagRaw(response)
  if (!parsed) return null

  if (parsed.type === "coordinates") {
    return { x: parsed.x, y: parsed.y, label: parsed.label }
  }

  // Marker-based pointing needs resolution - return null here
  // Client should use parsePointingTagRaw + resolveMarkerToCoordinates
  return null
}

/**
 * Remove POINT tag from response text for display/TTS.
 */
export function stripPointingTag(response: string): string {
  return response.replace(POINTING_TAG_REGEX, "").trim()
}
