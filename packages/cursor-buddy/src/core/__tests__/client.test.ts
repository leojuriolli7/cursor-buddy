import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { $audioLevel, $conversationHistory, $isEnabled } from "../atoms"
import { CursorBuddyClient, type CursorBuddyServices } from "../client"

const defaultScreenshot = {
  imageData: "data:image/jpeg;base64,test",
  width: 1280,
  height: 720,
  viewportWidth: 1920,
  viewportHeight: 1080,
  markerMap: new Map(),
  markerContext: "No interactive elements detected.",
}

function createJsonResponse(body: unknown, ok = true) {
  return {
    ok,
    json: vi.fn().mockResolvedValue(body),
  }
}

function createBlobResponse(blob: Blob, ok = true) {
  return {
    ok,
    blob: vi.fn().mockResolvedValue(blob),
  }
}

function createStreamResponse(chunks: string[], ok = true) {
  const encoder = new TextEncoder()
  let index = 0

  return {
    ok,
    body: {
      getReader: () => ({
        read: vi.fn().mockImplementation(async () => {
          if (index >= chunks.length) {
            return { done: true, value: undefined }
          }

          return {
            done: false,
            value: encoder.encode(chunks[index++]),
          }
        }),
      }),
    },
  }
}

function createDeferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void

  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve
    reject = promiseReject
  })

  return { promise, resolve, reject }
}

function createMockServices(
  overrides: Partial<CursorBuddyServices> = {},
): CursorBuddyServices & { emitLevel: (level: number) => void } {
  let levelCallback: ((level: number) => void) | null = null
  const pointerListeners = new Set<() => void>()
  const pointerState = { isPointing: false }

  const services: CursorBuddyServices & { emitLevel: (level: number) => void } =
    {
      voiceCapture: {
        start: vi.fn().mockResolvedValue(undefined),
        stop: vi
          .fn()
          .mockResolvedValue(new Blob(["audio"], { type: "audio/wav" })),
        onLevel: vi.fn((callback: (level: number) => void) => {
          levelCallback = callback
        }),
        dispose: vi.fn(),
      } as any,
      audioPlayback: {
        play: vi.fn().mockResolvedValue(undefined),
        stop: vi.fn(),
      } as any,
      screenCapture: {
        capture: vi.fn().mockResolvedValue(defaultScreenshot),
        captureAnnotated: vi.fn().mockResolvedValue(defaultScreenshot),
      } as any,
      pointerController: {
        pointAt: vi.fn(() => {
          pointerState.isPointing = true
          pointerListeners.forEach((listener) => listener())
        }),
        release: vi.fn(() => {
          pointerState.isPointing = false
          pointerListeners.forEach((listener) => listener())
        }),
        isPointing: vi.fn(() => pointerState.isPointing),
        subscribe: vi.fn((listener: () => void) => {
          pointerListeners.add(listener)
          return () => pointerListeners.delete(listener)
        }),
        updateFollowPosition: vi.fn(),
      } as any,
      emitLevel: (level: number) => {
        levelCallback?.(level)
      },
    }

  return Object.assign(services, overrides)
}

describe("CursorBuddyClient", () => {
  beforeEach(() => {
    $conversationHistory.set([])
    $audioLevel.set(0)
    $isEnabled.set(true)
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  describe("constructor", () => {
    it("wires voice level updates into the audio level atom", () => {
      const services = createMockServices()
      new CursorBuddyClient("/api", {}, services)

      services.emitLevel(0.42)

      expect($audioLevel.get()).toBe(0.42)
    })

    it("returns the same cached snapshot until state changes", () => {
      const client = new CursorBuddyClient("/api", {}, createMockServices())

      const firstSnapshot = client.getSnapshot()
      const secondSnapshot = client.getSnapshot()

      expect(secondSnapshot).toBe(firstSnapshot)

      client.startListening()

      expect(client.getSnapshot()).not.toBe(firstSnapshot)
    })
  })

  describe("startListening", () => {
    it("transitions to listening state", () => {
      const services = createMockServices()
      const client = new CursorBuddyClient("/api", {}, services)

      client.startListening()

      expect(client.getSnapshot().state).toBe("listening")
    })

    it("clears previous transcript, response, and error", () => {
      const services = createMockServices()
      const client = new CursorBuddyClient("/api", {}, services)

      ;(client as any).transcript = "old transcript"
      ;(client as any).response = "old response"
      ;(client as any).error = new Error("previous error")

      client.startListening()

      expect(client.getSnapshot()).toMatchObject({
        transcript: "",
        response: "",
        error: null,
      })
    })

    it("releases any active pointing and starts voice capture", () => {
      const services = createMockServices()
      const client = new CursorBuddyClient("/api", {}, services)

      client.startListening()

      expect(services.pointerController?.release).toHaveBeenCalledTimes(1)
      expect(services.voiceCapture?.start).toHaveBeenCalledTimes(1)
    })
  })

  describe("stopListening", () => {
    it("returns early when not currently listening", async () => {
      const services = createMockServices()
      const client = new CursorBuddyClient("/api", {}, services)

      await client.stopListening()

      expect(services.voiceCapture?.stop).not.toHaveBeenCalled()
      expect(services.screenCapture?.capture).not.toHaveBeenCalled()
    })

    it("processes a full turn, maps pointing coordinates, and appends atomic history", async () => {
      const onTranscript = vi.fn()
      const onResponse = vi.fn()
      const onPoint = vi.fn()
      const services = createMockServices()
      const client = new CursorBuddyClient(
        "/api",
        { onTranscript, onResponse, onPoint },
        services,
      )

      const fetchMock = vi.fn()
      vi.stubGlobal("fetch", fetchMock)

      fetchMock
        .mockResolvedValueOnce(
          createJsonResponse({ text: "Open the save menu" }),
        )
        .mockResolvedValueOnce(
          createStreamResponse(["Click Save ", "[POINT:640,360:Save button]"]),
        )
        .mockResolvedValueOnce(
          createBlobResponse(new Blob(["tts"], { type: "audio/mpeg" })),
        )

      client.startListening()
      await client.stopListening()

      expect(client.getSnapshot()).toMatchObject({
        state: "idle",
        transcript: "Open the save menu",
        response: "Click Save",
        error: null,
        isPointing: true,
      })
      expect(onTranscript).toHaveBeenCalledWith("Open the save menu")
      expect(onResponse).toHaveBeenCalledWith("Click Save")
      expect(onPoint).toHaveBeenCalledWith({
        x: 960,
        y: 540,
        label: "Save button",
      })
      expect(services.pointerController?.pointAt).toHaveBeenCalledWith({
        x: 960,
        y: 540,
        label: "Save button",
      })
      expect(services.audioPlayback?.play).toHaveBeenCalledTimes(1)
      expect($conversationHistory.get()).toEqual([
        { role: "user", content: "Open the save menu" },
        { role: "assistant", content: "Click Save" },
      ])

      expect(fetchMock).toHaveBeenCalledTimes(3)
      expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/transcribe")
      expect(fetchMock.mock.calls[1]?.[0]).toBe("/api/chat")
      expect(fetchMock.mock.calls[2]?.[0]).toBe("/api/tts")

      const chatPayload = JSON.parse(
        fetchMock.mock.calls[1]?.[1].body as string,
      )
      expect(chatPayload).toEqual({
        screenshot: defaultScreenshot.imageData,
        capture: {
          width: defaultScreenshot.width,
          height: defaultScreenshot.height,
        },
        transcript: "Open the save menu",
        history: [],
        markerContext: defaultScreenshot.markerContext,
      })

      const ttsPayload = JSON.parse(fetchMock.mock.calls[2]?.[1].body as string)
      expect(ttsPayload).toEqual({ text: "Click Save" })
    })

    it("does not append history for an interrupted in-flight turn", async () => {
      const onTranscript = vi.fn()
      const services = createMockServices()
      const client = new CursorBuddyClient("/api", { onTranscript }, services)
      const transcribe = createDeferred<{ text: string }>()

      const fetchMock = vi.fn()
      vi.stubGlobal("fetch", fetchMock)

      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockReturnValue(transcribe.promise),
      })

      client.startListening()
      const stopPromise = client.stopListening()

      client.startListening()
      transcribe.resolve({ text: "ignored after abort" })

      await stopPromise

      expect(client.getSnapshot()).toMatchObject({
        state: "listening",
        transcript: "",
        response: "",
        error: null,
      })
      expect(onTranscript).not.toHaveBeenCalled()
      expect($conversationHistory.get()).toEqual([])
    })

    it("surfaces request failures through the error state", async () => {
      const onError = vi.fn()
      const services = createMockServices()
      const client = new CursorBuddyClient("/api", { onError }, services)

      const fetchMock = vi.fn()
      vi.stubGlobal("fetch", fetchMock)
      fetchMock.mockResolvedValueOnce({ ok: false })

      client.startListening()
      await client.stopListening()

      expect(onError).toHaveBeenCalledWith(expect.any(Error))
      expect(client.getSnapshot()).toMatchObject({
        state: "idle",
        error: expect.objectContaining({
          message: "Transcription failed",
        }),
      })
      expect($conversationHistory.get()).toEqual([])
    })

    it("skips TTS when the cleaned response is empty", async () => {
      const services = createMockServices()
      const client = new CursorBuddyClient("/api", {}, services)

      const fetchMock = vi.fn()
      vi.stubGlobal("fetch", fetchMock)

      fetchMock
        .mockResolvedValueOnce(createJsonResponse({ text: "hello" }))
        .mockResolvedValueOnce(createStreamResponse(["   "]))

      client.startListening()
      await client.stopListening()

      expect(services.audioPlayback?.play).not.toHaveBeenCalled()
      expect(client.getSnapshot()).toMatchObject({
        state: "idle",
        transcript: "hello",
        response: "",
      })
      expect($conversationHistory.get()).toEqual([
        { role: "user", content: "hello" },
        { role: "assistant", content: "" },
      ])
    })
  })

  describe("interruption", () => {
    it("aborts the previous session when starting a new one", () => {
      const services = createMockServices()
      const client = new CursorBuddyClient("/api", {}, services)

      client.startListening()
      const firstController = (client as any).abortController

      client.startListening()

      expect(firstController?.signal.aborted).toBe(true)
      expect(services.audioPlayback?.stop).toHaveBeenCalled()
      expect($audioLevel.get()).toBe(0)
    })
  })

  describe("delegated controls", () => {
    it("returns the default snapshot shape before any interaction", () => {
      const client = new CursorBuddyClient("/api", {}, createMockServices())

      expect(client.getSnapshot()).toEqual({
        state: "idle",
        transcript: "",
        response: "",
        error: null,
        isPointing: false,
        isEnabled: true,
      })
    })

    it("updates enabled state in the snapshot", () => {
      const client = new CursorBuddyClient("/api", {}, createMockServices())

      client.setEnabled(false)

      expect($isEnabled.get()).toBe(false)
      expect(client.getSnapshot().isEnabled).toBe(false)
    })

    it("points and dismisses through the pointer controller", () => {
      const services = createMockServices()
      const client = new CursorBuddyClient("/api", {}, services)

      client.pointAt(100, 200, "Primary CTA")
      expect(services.pointerController?.pointAt).toHaveBeenCalledWith({
        x: 100,
        y: 200,
        label: "Primary CTA",
      })
      expect(client.getSnapshot().isPointing).toBe(true)

      client.dismissPointing()
      expect(services.pointerController?.release).toHaveBeenCalled()
      expect(client.getSnapshot().isPointing).toBe(false)
    })

    it("delegates follow updates to the pointer controller", () => {
      const services = createMockServices()
      const client = new CursorBuddyClient("/api", {}, services)

      client.updateCursorPosition()

      expect(
        services.pointerController?.updateFollowPosition,
      ).toHaveBeenCalledTimes(1)
    })
  })

  describe("reset and subscriptions", () => {
    it("returns to idle state on reset", () => {
      const client = new CursorBuddyClient("/api", {}, createMockServices())

      client.startListening()
      client.reset()

      expect(client.getSnapshot().state).toBe("idle")
    })

    it("returns to idle and clears state on reset", () => {
      const services = createMockServices()
      const client = new CursorBuddyClient("/api", {}, services)

      client.startListening()
      ;(client as any).transcript = "partial"
      ;(client as any).response = "partial response"
      ;(client as any).error = new Error("failure")

      client.reset()

      expect(client.getSnapshot()).toMatchObject({
        state: "idle",
        transcript: "",
        response: "",
        error: null,
      })
      expect(services.pointerController?.release).toHaveBeenCalled()
      expect(services.audioPlayback?.stop).toHaveBeenCalled()
    })

    it("notifies listeners on state changes and stops after unsubscribe", () => {
      const client = new CursorBuddyClient("/api", {}, createMockServices())
      const listener = vi.fn()

      const unsubscribe = client.subscribe(listener)
      client.startListening()
      expect(listener).toHaveBeenCalled()

      listener.mockClear()
      unsubscribe()
      client.reset()

      expect(listener).not.toHaveBeenCalled()
    })

    it("unsubscribe stops future notifications", () => {
      const client = new CursorBuddyClient("/api", {}, createMockServices())
      const listener = vi.fn()

      const unsubscribe = client.subscribe(listener)
      unsubscribe()
      client.startListening()

      expect(listener).not.toHaveBeenCalled()
    })

    it("calls onStateChange for listening transitions", () => {
      const onStateChange = vi.fn()
      const client = new CursorBuddyClient(
        "/api",
        { onStateChange },
        createMockServices(),
      )

      client.startListening()

      expect(onStateChange).toHaveBeenCalledWith("listening")
    })

    it("calls onError when voice capture start fails", async () => {
      const onError = vi.fn()
      const services = createMockServices({
        voiceCapture: {
          start: vi.fn().mockRejectedValue(new Error("mic denied")),
          stop: vi
            .fn()
            .mockResolvedValue(new Blob(["audio"], { type: "audio/wav" })),
          onLevel: vi.fn(),
          dispose: vi.fn(),
        } as any,
      })
      const client = new CursorBuddyClient("/api", { onError }, services)

      client.startListening()

      await vi.waitFor(() => {
        expect(onError).toHaveBeenCalledWith(
          expect.objectContaining({ message: "mic denied" }),
        )
      })
    })

    it("calls onStateChange and onError callbacks", async () => {
      const onStateChange = vi.fn()
      const onError = vi.fn()
      const services = createMockServices({
        voiceCapture: {
          start: vi.fn().mockRejectedValue(new Error("mic denied")),
          stop: vi
            .fn()
            .mockResolvedValue(new Blob(["audio"], { type: "audio/wav" })),
          onLevel: vi.fn(),
          dispose: vi.fn(),
        } as any,
      })
      const client = new CursorBuddyClient(
        "/api",
        { onStateChange, onError },
        services,
      )

      client.startListening()

      await vi.waitFor(() => {
        expect(onStateChange).toHaveBeenCalledWith("listening")
        expect(onStateChange).toHaveBeenCalledWith("idle")
        expect(onError).toHaveBeenCalledWith(expect.any(Error))
      })

      expect(client.getSnapshot().error).toEqual(
        expect.objectContaining({ message: "mic denied" }),
      )
    })
  })
})
