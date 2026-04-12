import { describe, it, expect, vi, beforeEach } from "vitest"
import { CursorBuddyClient, type CursorBuddyServices } from "../client"
import { $conversationHistory, $audioLevel, $isEnabled } from "../atoms"

// Mock services
function createMockServices(): CursorBuddyServices {
  return {
    voiceCapture: {
      start: vi.fn().mockResolvedValue(undefined),
      stop: vi.fn().mockResolvedValue(new Blob(["audio"], { type: "audio/wav" })),
      onLevel: vi.fn(),
      dispose: vi.fn(),
    } as any,
    audioPlayback: {
      play: vi.fn().mockResolvedValue(undefined),
      stop: vi.fn(),
    } as any,
    screenCapture: {
      capture: vi.fn().mockResolvedValue({
        imageData: "data:image/jpeg;base64,test",
        width: 1280,
        height: 720,
        viewportWidth: 1920,
        viewportHeight: 1080,
      }),
    } as any,
    pointerController: {
      pointAt: vi.fn(),
      release: vi.fn(),
      isPointing: vi.fn().mockReturnValue(false),
      subscribe: vi.fn().mockReturnValue(() => {}),
      updateFollowPosition: vi.fn(),
    } as any,
  }
}

describe("CursorBuddyClient", () => {
  beforeEach(() => {
    // Reset atoms
    $conversationHistory.set([])
    $audioLevel.set(0)
    $isEnabled.set(true)
  })

  describe("startListening", () => {
    it("transitions to listening state", () => {
      const services = createMockServices()
      const client = new CursorBuddyClient("/api", {}, services)

      client.startListening()

      expect(client.getSnapshot().state).toBe("listening")
    })

    it("clears previous transcript and response", () => {
      const services = createMockServices()
      const client = new CursorBuddyClient("/api", {}, services)

      // Manually set some state
      ;(client as any).transcript = "old transcript"
      ;(client as any).response = "old response"

      client.startListening()

      expect(client.getSnapshot().transcript).toBe("")
      expect(client.getSnapshot().response).toBe("")
    })

    it("clears error on new session", () => {
      const services = createMockServices()
      const client = new CursorBuddyClient("/api", {}, services)

      // Manually set an error
      ;(client as any).error = new Error("previous error")

      client.startListening()

      expect(client.getSnapshot().error).toBeNull()
    })

    it("releases any active pointing", () => {
      const services = createMockServices()
      const client = new CursorBuddyClient("/api", {}, services)

      client.startListening()

      expect(services.pointerController!.release).toHaveBeenCalled()
    })

    it("starts voice capture", () => {
      const services = createMockServices()
      const client = new CursorBuddyClient("/api", {}, services)

      client.startListening()

      expect(services.voiceCapture!.start).toHaveBeenCalled()
    })
  })

  describe("interruption", () => {
    it("aborts previous session when starting new one", () => {
      const services = createMockServices()
      const client = new CursorBuddyClient("/api", {}, services)

      client.startListening()
      const firstController = (client as any).abortController

      client.startListening()

      expect(firstController?.signal.aborted).toBe(true)
    })

    it("stops audio playback on interruption", () => {
      const services = createMockServices()
      const client = new CursorBuddyClient("/api", {}, services)

      client.startListening()
      client.startListening() // Interrupt

      expect(services.audioPlayback!.stop).toHaveBeenCalled()
    })
  })

  describe("subscription", () => {
    it("notifies listeners on state change", () => {
      const services = createMockServices()
      const client = new CursorBuddyClient("/api", {}, services)
      const listener = vi.fn()

      client.subscribe(listener)
      client.startListening()

      expect(listener).toHaveBeenCalled()
    })

    it("unsubscribe stops notifications", () => {
      const services = createMockServices()
      const client = new CursorBuddyClient("/api", {}, services)
      const listener = vi.fn()

      const unsubscribe = client.subscribe(listener)
      unsubscribe()
      client.startListening()

      expect(listener).not.toHaveBeenCalled()
    })
  })

  describe("getSnapshot", () => {
    it("returns current state", () => {
      const services = createMockServices()
      const client = new CursorBuddyClient("/api", {}, services)

      const snapshot = client.getSnapshot()

      expect(snapshot).toEqual({
        state: "idle",
        transcript: "",
        response: "",
        error: null,
        isPointing: false,
        isEnabled: true,
      })
    })
  })

  describe("setEnabled", () => {
    it("updates isEnabled atom", () => {
      const services = createMockServices()
      const client = new CursorBuddyClient("/api", {}, services)

      client.setEnabled(false)

      expect($isEnabled.get()).toBe(false)
      expect(client.getSnapshot().isEnabled).toBe(false)
    })
  })

  describe("reset", () => {
    it("returns to idle state", () => {
      const services = createMockServices()
      const client = new CursorBuddyClient("/api", {}, services)

      client.startListening()
      client.reset()

      expect(client.getSnapshot().state).toBe("idle")
    })

    it("clears all state", () => {
      const services = createMockServices()
      const client = new CursorBuddyClient("/api", {}, services)

      ;(client as any).transcript = "test"
      ;(client as any).response = "test"
      ;(client as any).error = new Error("test")

      client.reset()

      const snapshot = client.getSnapshot()
      expect(snapshot.transcript).toBe("")
      expect(snapshot.response).toBe("")
      expect(snapshot.error).toBeNull()
    })

    it("releases pointing", () => {
      const services = createMockServices()
      const client = new CursorBuddyClient("/api", {}, services)

      client.reset()

      expect(services.pointerController!.release).toHaveBeenCalled()
    })
  })

  describe("callbacks", () => {
    it("calls onStateChange on state transitions", () => {
      const onStateChange = vi.fn()
      const services = createMockServices()
      const client = new CursorBuddyClient("/api", { onStateChange }, services)

      client.startListening()

      expect(onStateChange).toHaveBeenCalledWith("listening")
    })

    it("calls onError when error occurs", () => {
      const onError = vi.fn()
      const services = createMockServices()
      services.voiceCapture!.start = vi.fn().mockRejectedValue(new Error("mic denied"))
      const client = new CursorBuddyClient("/api", { onError }, services)

      client.startListening()

      // Wait for async error
      return new Promise<void>((resolve) => {
        setTimeout(() => {
          expect(onError).toHaveBeenCalled()
          resolve()
        }, 10)
      })
    })
  })
})
