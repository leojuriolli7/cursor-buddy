import type { PointingTarget } from "./types"

/**
 * Parses [POINT:x,y:label] tags from AI responses.
 * Format matches the Swift Clicky app for consistency.
 */

const POINTING_TAG_REGEX = /\[POINT:(\d+),(\d+):([^\]]+)\]\s*$/

/**
 * Extract pointing target from response text.
 * Returns null if no valid POINT tag is found at the end.
 */
export function parsePointingTag(response: string): PointingTarget | null {
  const match = response.match(POINTING_TAG_REGEX)
  if (!match) return null

  return {
    x: parseInt(match[1], 10),
    y: parseInt(match[2], 10),
    label: match[3].trim(),
  }
}

/**
 * Remove POINT tag from response text for display/TTS.
 */
export function stripPointingTag(response: string): string {
  return response.replace(POINTING_TAG_REGEX, "").trim()
}
