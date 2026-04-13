import {
  $buddyPosition,
  $buddyRotation,
  $buddyScale,
  $cursorPosition,
  $pointingTarget,
} from "../atoms"
import { animateBezierFlight } from "../bezier"
import type { PointingTarget, PointerControllerPort } from "../types"

const POINTING_LOCK_TIMEOUT_MS = 10_000

type PointerMode = "follow" | "flying" | "anchored"

/**
 * Controller for cursor pointing behavior.
 * Manages the pointer state machine (follow -> flying -> anchored -> follow)
 * and cursor animation.
 */
export class PointerController implements PointerControllerPort {
  private mode: PointerMode = "follow"
  private cancelAnimation: (() => void) | null = null
  private releaseTimeout: ReturnType<typeof setTimeout> | null = null
  private listeners = new Set<() => void>()

  /**
   * Animate cursor to point at a target.
   */
  pointAt(target: PointingTarget): void {
    // Clear any previous pointing state
    this.release()

    this.mode = "flying"
    $pointingTarget.set(target)

    const startPos = $buddyPosition.get()
    const endPos = { x: target.x, y: target.y }

    this.cancelAnimation = animateBezierFlight(startPos, endPos, 800, {
      onFrame: (position, rotation, scale) => {
        $buddyPosition.set(position)
        $buddyRotation.set(rotation)
        $buddyScale.set(scale)
      },
      onComplete: () => {
        this.cancelAnimation = null
        this.mode = "anchored"
        $buddyPosition.set(endPos)
        $buddyRotation.set(0)
        $buddyScale.set(1)
        this.scheduleRelease()
        this.notify()
      },
    })

    this.notify()
  }

  /**
   * Release the cursor from pointing mode back to follow mode.
   */
  release(): void {
    // Cancel any in-progress animation
    if (this.cancelAnimation) {
      this.cancelAnimation()
      this.cancelAnimation = null
    }

    // Clear release timeout
    if (this.releaseTimeout) {
      clearTimeout(this.releaseTimeout)
      this.releaseTimeout = null
    }

    // Reset to follow mode
    this.mode = "follow"
    $pointingTarget.set(null)
    $buddyPosition.set($cursorPosition.get())
    $buddyRotation.set(0)
    $buddyScale.set(1)

    this.notify()
  }

  /**
   * Check if cursor is currently pointing (flying or anchored).
   */
  isPointing(): boolean {
    return this.mode !== "follow"
  }

  /**
   * Get current pointer mode.
   */
  getMode(): PointerMode {
    return this.mode
  }

  /**
   * Subscribe to pointer state changes.
   */
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  /**
   * Update buddy position to follow cursor when in follow mode.
   * Call this on cursor position changes.
   */
  updateFollowPosition(): void {
    if (this.mode === "follow") {
      $buddyPosition.set($cursorPosition.get())
      $buddyRotation.set(0)
      $buddyScale.set(1)
    }
  }

  private scheduleRelease(): void {
    this.releaseTimeout = setTimeout(() => {
      this.releaseTimeout = null
      this.release()
    }, POINTING_LOCK_TIMEOUT_MS)
  }

  private notify(): void {
    this.listeners.forEach((listener) => listener())
  }
}
