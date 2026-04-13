import { atom } from "nanostores"
import type { ConversationMessage, Point, PointingTarget } from "./types"

/**
 * Nanostores atoms for reactive values that don't need state machine semantics.
 * These update frequently (e.g., 60fps audio levels) and are framework-agnostic.
 */

// Audio level during recording (0-1, updates at ~60fps)
export const $audioLevel = atom<number>(0)

// Mouse cursor position (real cursor, not buddy)
export const $cursorPosition = atom<Point>({ x: 0, y: 0 })

// Buddy animated position (follows cursor with spring physics, or flies to target)
export const $buddyPosition = atom<Point>({ x: 0, y: 0 })

// Buddy rotation in radians (direction of travel during pointing)
export const $buddyRotation = atom<number>(0)

// Buddy scale (1.0 normal, up to 1.3 during flight)
export const $buddyScale = atom<number>(1)

// Current pointing target parsed from AI response
export const $pointingTarget = atom<PointingTarget | null>(null)

// Whether buddy overlay is enabled/visible
export const $isEnabled = atom<boolean>(true)

// Whether TTS is currently playing
export const $isSpeaking = atom<boolean>(false)

// Conversation history for context
export const $conversationHistory = atom<ConversationMessage[]>([])
