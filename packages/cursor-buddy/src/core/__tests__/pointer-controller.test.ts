import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { PointerController } from "../services/pointer-controller"
import {
  $buddyPosition,
  $buddyRotation,
  $buddyScale,
  $cursorPosition,
  $pointingTarget,
} from "../atoms"

// Mock animateBezierFlight
vi.mock("../bezier", () => ({
  animateBezierFlight: vi.fn((_from, _to, _duration, callbacks) => {
    // Simulate immediate completion
    callbacks.onFrame({ x: 100, y: 100 }, 0.5, 1.2)
    // Return cancel function
    const cancel = vi.fn()
    // Schedule completion on next tick
    setTimeout(() => callbacks.onComplete(), 0)
    return cancel
  }),
}))

describe("PointerController", () => {
  let controller: PointerController

  beforeEach(() => {
    // Reset atoms
    $buddyPosition.set({ x: 0, y: 0 })
    $buddyRotation.set(0)
    $buddyScale.set(1)
    $cursorPosition.set({ x: 50, y: 50 })
    $pointingTarget.set(null)

    controller = new PointerController()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.clearAllMocks()
  })

  describe("initial state", () => {
    it("starts in follow mode", () => {
      expect(controller.getMode()).toBe("follow")
    })

    it("isPointing returns false initially", () => {
      expect(controller.isPointing()).toBe(false)
    })
  })

  describe("pointAt", () => {
    it("transitions to flying mode", () => {
      controller.pointAt({ x: 200, y: 200, label: "Button" })

      expect(controller.getMode()).toBe("flying")
    })

    it("sets pointing target atom", () => {
      const target = { x: 200, y: 200, label: "Button" }
      controller.pointAt(target)

      expect($pointingTarget.get()).toEqual(target)
    })

    it("isPointing returns true during flight", () => {
      controller.pointAt({ x: 200, y: 200, label: "Button" })

      expect(controller.isPointing()).toBe(true)
    })

    it("notifies subscribers when starting flight", () => {
      const listener = vi.fn()
      controller.subscribe(listener)

      controller.pointAt({ x: 200, y: 200, label: "Button" })

      expect(listener).toHaveBeenCalled()
    })

    it("transitions to anchored mode on animation complete", async () => {
      controller.pointAt({ x: 200, y: 200, label: "Button" })

      // Animation completes on the mocked next tick only.
      await vi.advanceTimersByTimeAsync(0)

      expect(controller.getMode()).toBe("anchored")
    })

    it("releases previous pointing before starting new one", () => {
      const releaseSpy = vi.spyOn(controller, "release")

      controller.pointAt({ x: 100, y: 100, label: "First" })
      controller.pointAt({ x: 200, y: 200, label: "Second" })

      expect(releaseSpy).toHaveBeenCalledTimes(2) // Initial + before second
    })
  })

  describe("release", () => {
    it("transitions to follow mode", () => {
      controller.pointAt({ x: 200, y: 200, label: "Button" })
      controller.release()

      expect(controller.getMode()).toBe("follow")
    })

    it("clears pointing target atom", () => {
      controller.pointAt({ x: 200, y: 200, label: "Button" })
      controller.release()

      expect($pointingTarget.get()).toBeNull()
    })

    it("isPointing returns false after release", () => {
      controller.pointAt({ x: 200, y: 200, label: "Button" })
      controller.release()

      expect(controller.isPointing()).toBe(false)
    })

    it("resets buddy position to cursor position", () => {
      $cursorPosition.set({ x: 75, y: 75 })
      controller.pointAt({ x: 200, y: 200, label: "Button" })
      controller.release()

      expect($buddyPosition.get()).toEqual({ x: 75, y: 75 })
    })

    it("resets rotation and scale", () => {
      controller.pointAt({ x: 200, y: 200, label: "Button" })
      controller.release()

      expect($buddyRotation.get()).toBe(0)
      expect($buddyScale.get()).toBe(1)
    })

    it("notifies subscribers", () => {
      const listener = vi.fn()
      controller.subscribe(listener)

      controller.release()

      expect(listener).toHaveBeenCalled()
    })

    it("is safe to call multiple times", () => {
      expect(() => {
        controller.release()
        controller.release()
        controller.release()
      }).not.toThrow()
    })
  })

  describe("auto-release timeout", () => {
    it("auto-releases after 10 seconds in anchored mode", async () => {
      controller.pointAt({ x: 200, y: 200, label: "Button" })

      // Complete animation to enter anchored mode
      await vi.advanceTimersByTimeAsync(0)
      expect(controller.getMode()).toBe("anchored")

      // Advance 10 seconds
      await vi.advanceTimersByTimeAsync(10_000)

      expect(controller.getMode()).toBe("follow")
    })

    it("clears timeout on manual release", async () => {
      controller.pointAt({ x: 200, y: 200, label: "Button" })
      await vi.advanceTimersByTimeAsync(0)

      controller.release()

      // Advance past timeout - should not throw or change state
      await vi.advanceTimersByTimeAsync(15_000)

      expect(controller.getMode()).toBe("follow")
    })
  })

  describe("updateFollowPosition", () => {
    it("updates buddy position to cursor position in follow mode", () => {
      $cursorPosition.set({ x: 100, y: 150 })

      controller.updateFollowPosition()

      expect($buddyPosition.get()).toEqual({ x: 100, y: 150 })
    })

    it("does not update position when pointing", () => {
      controller.pointAt({ x: 200, y: 200, label: "Button" })
      $cursorPosition.set({ x: 999, y: 999 })

      controller.updateFollowPosition()

      // Position should not change to cursor position
      expect($buddyPosition.get()).not.toEqual({ x: 999, y: 999 })
    })

    it("resets rotation and scale in follow mode", () => {
      $buddyRotation.set(1.5)
      $buddyScale.set(1.3)

      controller.updateFollowPosition()

      expect($buddyRotation.get()).toBe(0)
      expect($buddyScale.get()).toBe(1)
    })
  })

  describe("subscribe", () => {
    it("adds listener and returns unsubscribe function", () => {
      const listener = vi.fn()

      const unsubscribe = controller.subscribe(listener)
      controller.release()
      expect(listener).toHaveBeenCalledTimes(1)

      unsubscribe()
      controller.release()
      expect(listener).toHaveBeenCalledTimes(1) // Not called again
    })

    it("supports multiple subscribers", () => {
      const listener1 = vi.fn()
      const listener2 = vi.fn()

      controller.subscribe(listener1)
      controller.subscribe(listener2)
      controller.release()

      expect(listener1).toHaveBeenCalled()
      expect(listener2).toHaveBeenCalled()
    })
  })
})
