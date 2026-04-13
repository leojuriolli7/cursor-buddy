import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { $audioLevel, $conversationHistory, $isEnabled } from "../atoms"
import { CursorBuddyClient } from "../client"
import {
  createBlobResponse,
  createDeferred,
  createJsonResponse,
  createMockServices,
  createStreamResponse,
  defaultAnnotatedScreenshot,
} from "./test-utils"

function readJsonRequestBody(
  fetchMock: ReturnType<typeof vi.fn>,
  callIndex: number,
) {
  const init = fetchMock.mock.calls[callIndex]?.[1]

  if (
    !init ||
    typeof init !== "object" ||
    !("body" in init) ||
    typeof init.body !== "string"
  ) {
    throw new Error(`Expected a JSON request body for fetch call ${callIndex}`)
  }

  return JSON.parse(init.body)
}

function readFetchSignal(
  fetchMock: ReturnType<typeof vi.fn>,
  callIndex: number,
) {
  const init = fetchMock.mock.calls[callIndex]?.[1]

  if (
    !init ||
    typeof init !== "object" ||
    !("signal" in init) ||
    !(init.signal instanceof AbortSignal)
  ) {
    throw new Error(`Expected an AbortSignal for fetch call ${callIndex}`)
  }

  return init.signal
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
      const { services, emitLevel } = createMockServices()
      new CursorBuddyClient("/api", {}, services)

      emitLevel(0.42)

      expect($audioLevel.get()).toBe(0.42)
    })

    it("returns the same cached snapshot until state changes", () => {
      const { services } = createMockServices()
      const client = new CursorBuddyClient("/api", {}, services)

      const firstSnapshot = client.getSnapshot()
      const secondSnapshot = client.getSnapshot()

      expect(secondSnapshot).toBe(firstSnapshot)

      client.startListening()

      expect(client.getSnapshot()).not.toBe(firstSnapshot)
    })
  })

  describe("startListening", () => {
    it("transitions to listening state", () => {
      const { services } = createMockServices()
      const client = new CursorBuddyClient("/api", {}, services)

      client.startListening()

      expect(client.getSnapshot().state).toBe("listening")
    })

    it("clears previous transcript and response when starting a new turn", async () => {
      const { services } = createMockServices()
      const client = new CursorBuddyClient("/api", {}, services)
      const fetchMock = vi.fn()
      vi.stubGlobal("fetch", fetchMock)

      fetchMock
        .mockResolvedValueOnce(
          createJsonResponse({ text: "Open the save menu" }),
        )
        .mockResolvedValueOnce(createStreamResponse(["Click Save"]))
        .mockResolvedValueOnce(
          createBlobResponse(new Blob(["tts"], { type: "audio/mpeg" })),
        )

      client.startListening()
      await client.stopListening()

      expect(client.getSnapshot()).toMatchObject({
        transcript: "Open the save menu",
        response: "Click Save",
        error: null,
      })

      client.startListening()

      expect(client.getSnapshot()).toMatchObject({
        transcript: "",
        response: "",
        error: null,
      })
    })

    it("clears previous errors when starting a new turn", async () => {
      const { services } = createMockServices()
      const client = new CursorBuddyClient("/api", {}, services)
      const fetchMock = vi.fn()
      vi.stubGlobal("fetch", fetchMock)

      fetchMock.mockResolvedValueOnce({ ok: false })

      client.startListening()
      await client.stopListening()

      expect(client.getSnapshot().error).toEqual(
        expect.objectContaining({ message: "Transcription failed" }),
      )

      client.startListening()

      expect(client.getSnapshot()).toMatchObject({
        transcript: "",
        response: "",
        error: null,
      })
    })

    it("releases any active pointing and starts voice capture", () => {
      const { services, pointerController, voiceCapture } = createMockServices()
      const client = new CursorBuddyClient("/api", {}, services)

      client.startListening()

      expect(pointerController.release).toHaveBeenCalledTimes(1)
      expect(voiceCapture.start).toHaveBeenCalledTimes(1)
    })
  })

  describe("stopListening", () => {
    it("returns early when not currently listening", async () => {
      const { services, voiceCapture, screenCapture } = createMockServices()
      const client = new CursorBuddyClient("/api", {}, services)

      await client.stopListening()

      expect(voiceCapture.stop).not.toHaveBeenCalled()
      expect(screenCapture.captureAnnotated).not.toHaveBeenCalled()
    })

    it("processes a full turn, maps pointing coordinates, and appends atomic history", async () => {
      const onTranscript = vi.fn()
      const onResponse = vi.fn()
      const onPoint = vi.fn()
      const { services, pointerController, audioPlayback } =
        createMockServices()
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
      expect(pointerController.pointAt).toHaveBeenCalledWith({
        x: 960,
        y: 540,
        label: "Save button",
      })
      expect(audioPlayback.play).toHaveBeenCalledTimes(1)
      expect($conversationHistory.get()).toEqual([
        { role: "user", content: "Open the save menu" },
        { role: "assistant", content: "Click Save" },
      ])

      expect(fetchMock).toHaveBeenCalledTimes(3)
      expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/transcribe")
      expect(fetchMock.mock.calls[1]?.[0]).toBe("/api/chat")
      expect(fetchMock.mock.calls[2]?.[0]).toBe("/api/tts")

      const chatPayload = readJsonRequestBody(fetchMock, 1)
      expect(chatPayload).toEqual({
        screenshot: defaultAnnotatedScreenshot.imageData,
        capture: {
          width: defaultAnnotatedScreenshot.width,
          height: defaultAnnotatedScreenshot.height,
        },
        transcript: "Open the save menu",
        history: [],
        markerContext: defaultAnnotatedScreenshot.markerContext,
      })

      const ttsPayload = readJsonRequestBody(fetchMock, 2)
      expect(ttsPayload).toEqual({ text: "Click Save" })
    })

    it("does not append history when interrupted before response starts", async () => {
      const onTranscript = vi.fn()
      const { services } = createMockServices()
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
      const { services } = createMockServices()
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
      const { services, audioPlayback } = createMockServices()
      const client = new CursorBuddyClient("/api", {}, services)

      const fetchMock = vi.fn()
      vi.stubGlobal("fetch", fetchMock)

      fetchMock
        .mockResolvedValueOnce(createJsonResponse({ text: "hello" }))
        .mockResolvedValueOnce(createStreamResponse(["   "]))

      client.startListening()
      await client.stopListening()

      expect(audioPlayback.play).not.toHaveBeenCalled()
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
    it("aborts the previous session when starting a new one", async () => {
      const { services, audioPlayback } = createMockServices()
      const client = new CursorBuddyClient("/api", {}, services)
      const transcribe = createDeferred<{ text: string }>()
      const fetchMock = vi.fn()
      vi.stubGlobal("fetch", fetchMock)

      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockReturnValue(transcribe.promise),
      })

      client.startListening()
      const stopPromise = client.stopListening()
      await vi.waitFor(() => {
        expect(fetchMock).toHaveBeenCalledTimes(1)
      })
      const firstSignal = readFetchSignal(fetchMock, 0)

      client.startListening()
      transcribe.resolve({ text: "ignored after abort" })
      await stopPromise

      expect(firstSignal.aborted).toBe(true)
      expect(audioPlayback.stop).toHaveBeenCalled()
      expect($audioLevel.get()).toBe(0)
    })

    it("commits partial history when interrupted mid-response", async () => {
      const { services } = createMockServices()
      const client = new CursorBuddyClient("/api", {}, services)
      const ttsDeferred = createDeferred<Blob>()
      const fetchMock = vi.fn()
      vi.stubGlobal("fetch", fetchMock)

      // Transcription completes
      fetchMock.mockResolvedValueOnce(
        createJsonResponse({ text: "What is this button?" }),
      )
      // Chat streams partial response with pointing tag
      fetchMock.mockResolvedValueOnce(
        createStreamResponse(["This is the submit button [POINT:5:Submit]"]),
      )
      // TTS hangs
      fetchMock.mockResolvedValueOnce({
        ok: true,
        blob: vi.fn().mockReturnValue(ttsDeferred.promise),
      })

      client.startListening()
      const stopPromise = client.stopListening()

      // Wait for TTS to be called (chat completed)
      await vi.waitFor(() => {
        expect(fetchMock).toHaveBeenCalledTimes(3)
      })

      // Interrupt before TTS completes
      client.startListening()
      ttsDeferred.resolve(new Blob(["audio"], { type: "audio/mpeg" }))
      await stopPromise

      // History should contain the partial turn (response stripped of POINT tag)
      expect($conversationHistory.get()).toEqual([
        { role: "user", content: "What is this button?" },
        { role: "assistant", content: "This is the submit button" },
      ])
    })

    it("does not double-commit history when interrupted after completion", async () => {
      const { services } = createMockServices()
      const client = new CursorBuddyClient("/api", {}, services)
      const fetchMock = vi.fn()
      vi.stubGlobal("fetch", fetchMock)

      // Complete turn
      fetchMock
        .mockResolvedValueOnce(createJsonResponse({ text: "First question" }))
        .mockResolvedValueOnce(createStreamResponse(["First answer"]))
        .mockResolvedValueOnce(
          createBlobResponse(new Blob(["tts"], { type: "audio/mpeg" })),
        )

      client.startListening()
      await client.stopListening()

      expect($conversationHistory.get()).toEqual([
        { role: "user", content: "First question" },
        { role: "assistant", content: "First answer" },
      ])

      // Start a new turn (this calls abort() internally)
      client.startListening()

      // History should still have exactly one exchange, not duplicated
      expect($conversationHistory.get()).toEqual([
        { role: "user", content: "First question" },
        { role: "assistant", content: "First answer" },
      ])
    })
  })

  describe("delegated controls", () => {
    it("returns the default snapshot shape before any interaction", () => {
      const { services } = createMockServices()
      const client = new CursorBuddyClient("/api", {}, services)

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
      const { services } = createMockServices()
      const client = new CursorBuddyClient("/api", {}, services)

      client.setEnabled(false)

      expect($isEnabled.get()).toBe(false)
      expect(client.getSnapshot().isEnabled).toBe(false)
    })

    it("points and dismisses through the pointer controller", () => {
      const { services, pointerController } = createMockServices()
      const client = new CursorBuddyClient("/api", {}, services)

      client.pointAt(100, 200, "Primary CTA")
      expect(pointerController.pointAt).toHaveBeenCalledWith({
        x: 100,
        y: 200,
        label: "Primary CTA",
      })
      expect(client.getSnapshot().isPointing).toBe(true)

      client.dismissPointing()
      expect(pointerController.release).toHaveBeenCalled()
      expect(client.getSnapshot().isPointing).toBe(false)
    })

    it("delegates follow updates to the pointer controller", () => {
      const { services, pointerController } = createMockServices()
      const client = new CursorBuddyClient("/api", {}, services)

      client.updateCursorPosition()

      expect(pointerController.updateFollowPosition).toHaveBeenCalledTimes(1)
    })
  })

  describe("reset and subscriptions", () => {
    it("returns to idle state on reset", () => {
      const { services } = createMockServices()
      const client = new CursorBuddyClient("/api", {}, services)

      client.startListening()
      client.reset()

      expect(client.getSnapshot().state).toBe("idle")
    })

    it("returns to idle and clears transcript and response on reset", async () => {
      const { services, pointerController, audioPlayback } =
        createMockServices()
      const client = new CursorBuddyClient("/api", {}, services)
      const fetchMock = vi.fn()
      vi.stubGlobal("fetch", fetchMock)

      client.startListening()
      fetchMock
        .mockResolvedValueOnce(createJsonResponse({ text: "partial" }))
        .mockResolvedValueOnce(createStreamResponse(["partial response"]))
        .mockResolvedValueOnce(
          createBlobResponse(new Blob(["tts"], { type: "audio/mpeg" })),
        )
      await client.stopListening()

      client.reset()

      expect(client.getSnapshot()).toMatchObject({
        state: "idle",
        transcript: "",
        response: "",
        error: null,
      })
      expect(pointerController.release).toHaveBeenCalled()
      expect(audioPlayback.stop).toHaveBeenCalled()
    })

    it("clears previous errors on reset", async () => {
      const { services } = createMockServices()
      const client = new CursorBuddyClient("/api", {}, services)
      const fetchMock = vi.fn()
      vi.stubGlobal("fetch", fetchMock)

      fetchMock.mockResolvedValueOnce({ ok: false })

      client.startListening()
      await client.stopListening()

      expect(client.getSnapshot().error).toEqual(
        expect.objectContaining({ message: "Transcription failed" }),
      )

      client.reset()

      expect(client.getSnapshot().error).toBeNull()
    })

    it("notifies listeners on state changes and stops after unsubscribe", () => {
      const { services } = createMockServices()
      const client = new CursorBuddyClient("/api", {}, services)
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
      const { services } = createMockServices()
      const client = new CursorBuddyClient("/api", {}, services)
      const listener = vi.fn()

      const unsubscribe = client.subscribe(listener)
      unsubscribe()
      client.startListening()

      expect(listener).not.toHaveBeenCalled()
    })

    it("calls onStateChange for listening transitions", () => {
      const onStateChange = vi.fn()
      const { services } = createMockServices()
      const client = new CursorBuddyClient("/api", { onStateChange }, services)

      client.startListening()

      expect(onStateChange).toHaveBeenCalledWith("listening")
    })

    it("calls onError when voice capture start fails", async () => {
      const onError = vi.fn()
      const { services } = createMockServices({
        voiceCapture: {
          start: vi
            .fn<() => Promise<void>>()
            .mockRejectedValue(new Error("mic denied")),
        },
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
      const { services } = createMockServices({
        voiceCapture: {
          start: vi
            .fn<() => Promise<void>>()
            .mockRejectedValue(new Error("mic denied")),
        },
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
