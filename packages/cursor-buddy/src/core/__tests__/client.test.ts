import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { $audioLevel, $conversationHistory, $isEnabled } from "../atoms"
import { CursorBuddyClient } from "../client"
import type { ScreenshotResult } from "../types"
import {
  createBlobResponse,
  createDeferred,
  createJsonResponse,
  createMockServices,
  createUIStreamResponse,
  defaultScreenshotResult,
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

function createControlledStreamResponse(
  reads: Array<
    ReturnType<typeof createDeferred<ReadableStreamReadResult<Uint8Array>>>
  >,
) {
  let index = 0

  return {
    ok: true,
    body: {
      getReader: () => ({
        read: vi.fn().mockImplementation(() => {
          const nextRead = reads[index++]
          if (!nextRead) {
            return Promise.resolve({ done: true, value: undefined })
          }

          return nextRead.promise
        }),
      }),
    },
  }
}

/**
 * Helper to create a text-delta chunk for controlled stream tests
 */
function textDeltaChunk(text: string): Uint8Array {
  const encoder = new TextEncoder()
  return encoder.encode(
    JSON.stringify({ type: "text-delta", delta: text, id: "text-1" }) + "\n",
  )
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

    it("starts screenshot capture immediately on hotkey press", () => {
      const { services, screenCapture } = createMockServices()
      const client = new CursorBuddyClient("/api", {}, services)

      // Screenshot should NOT be called before startListening
      expect(screenCapture.capture).not.toHaveBeenCalled()

      client.startListening()

      // Screenshot SHOULD be called immediately on hotkey press
      expect(screenCapture.capture).toHaveBeenCalledTimes(1)
    })

    it("updates the live transcript while browser transcription is listening", () => {
      const { services, emitLiveTranscript } = createMockServices()
      const client = new CursorBuddyClient("/api", {}, services)

      client.startListening()
      emitLiveTranscript("Open the")

      expect(client.getSnapshot()).toMatchObject({
        state: "listening",
        liveTranscript: "Open the",
      })
    })

    it("clears previous transcript and response when starting a new turn", async () => {
      const { services, emitLiveTranscript } = createMockServices()
      const client = new CursorBuddyClient("/api", {}, services)
      const fetchMock = vi.fn()
      vi.stubGlobal("fetch", fetchMock)

      fetchMock
        .mockResolvedValueOnce(
          createJsonResponse({ text: "Open the save menu" }),
        )
        .mockResolvedValueOnce(createUIStreamResponse(["Click Save"]))
        .mockResolvedValueOnce(
          createBlobResponse(new Blob(["tts"], { type: "audio/mpeg" })),
        )

      client.startListening()
      await client.stopListening()

      expect(client.getSnapshot()).toMatchObject({
        liveTranscript: "",
        transcript: "Open the save menu",
        response: "Click Save",
        error: null,
      })

      emitLiveTranscript("draft transcript")
      client.startListening()

      expect(client.getSnapshot()).toMatchObject({
        liveTranscript: "",
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
        liveTranscript: "",
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
      expect(services.liveTranscription?.start).toHaveBeenCalledTimes(1)
    })
  })

  describe("stopListening", () => {
    it("returns early when not currently listening", async () => {
      const { services, voiceCapture, screenCapture } = createMockServices()
      const client = new CursorBuddyClient("/api", {}, services)

      await client.stopListening()

      expect(voiceCapture.stop).not.toHaveBeenCalled()
      // Screenshot is NOT called on stopListening (it's started on startListening)
      expect(screenCapture.capture).not.toHaveBeenCalled()
    })

    it("uses the screenshot captured on hotkey press (not on release)", async () => {
      const { services, screenCapture } = createMockServices()
      const client = new CursorBuddyClient("/api", {}, services)

      const fetchMock = vi.fn()
      vi.stubGlobal("fetch", fetchMock)

      fetchMock
        .mockResolvedValueOnce(createJsonResponse({ text: "hello" }))
        .mockResolvedValueOnce(createUIStreamResponse(["Hi there"]))
        .mockResolvedValueOnce(
          createBlobResponse(new Blob(["tts"], { type: "audio/mpeg" })),
        )

      client.startListening()

      // Screenshot should have been called exactly once on start
      expect(screenCapture.capture).toHaveBeenCalledTimes(1)

      await client.stopListening()

      // Screenshot should STILL only have been called once (on start, not on stop)
      expect(screenCapture.capture).toHaveBeenCalledTimes(1)

      // Verify the screenshot was used in the chat request
      const chatPayload = readJsonRequestBody(fetchMock, 1)
      expect(chatPayload.screenshot).toBe(defaultScreenshotResult.imageData)
    })

    it("fails the turn when screenshot capture fails", async () => {
      const onError = vi.fn()
      const { services, screenCapture } = createMockServices({
        screenCapture: {
          capture: vi
            .fn<() => Promise<ScreenshotResult>>()
            .mockRejectedValue(new Error("screenshot failed")),
        },
      })
      const client = new CursorBuddyClient("/api", { onError }, services)

      const fetchMock = vi.fn()
      vi.stubGlobal("fetch", fetchMock)

      client.startListening()
      await client.stopListening()

      // Should report screenshot error with the original error details
      expect(onError).toHaveBeenCalledWith(
        expect.objectContaining({
          message: "Failed to capture screenshot: screenshot failed",
        }),
      )
      expect(client.getSnapshot()).toMatchObject({
        state: "idle",
        error: expect.objectContaining({
          message: "Failed to capture screenshot: screenshot failed",
        }),
      })
      // No chat request should be made
      expect(fetchMock).not.toHaveBeenCalled()
    })

    it("processes a full turn, maps pointing coordinates, and appends atomic history", async () => {
      const onTranscript = vi.fn()
      const onResponse = vi.fn()
      const onPoint = vi.fn()

      // Create a mock element for the point tool to look up
      const mockElement = {
        getBoundingClientRect: vi.fn().mockReturnValue({
          left: 640,
          top: 360,
          width: 100,
          height: 50,
        }),
      } as unknown as HTMLElement

      const elementRegistry = new Map<number, HTMLElement>()
      elementRegistry.set(5, mockElement)

      const { services, pointerController, audioPlayback } = createMockServices(
        {
          screenCapture: {
            capture: vi
              .fn<() => Promise<ScreenshotResult>>()
              .mockResolvedValue({
                ...defaultScreenshotResult,
                elementRegistry,
              }),
          },
        },
      )

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
          createUIStreamResponse(["Click Save "], {
            toolName: "point",
            args: { elementId: 5, label: "Save button" },
          }),
        )
        .mockResolvedValueOnce(
          createBlobResponse(new Blob(["tts"], { type: "audio/mpeg" })),
        )

      client.startListening()
      await client.stopListening()

      expect(client.getSnapshot()).toMatchObject({
        state: "idle",
        liveTranscript: "",
        transcript: "Open the save menu",
        response: "Click Save",
        error: null,
        isPointing: true,
      })
      expect(onTranscript).toHaveBeenCalledWith("Open the save menu")
      expect(onResponse).toHaveBeenCalledWith("Click Save")
      // Element center should be at (640 + 50, 360 + 25) = (690, 385)
      expect(onPoint).toHaveBeenCalledWith({
        x: 690,
        y: 385,
        label: "Save button",
      })
      expect(pointerController.pointAt).toHaveBeenCalledWith({
        x: 690,
        y: 385,
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
        screenshot: defaultScreenshotResult.imageData,
        capture: {
          width: defaultScreenshotResult.width,
          height: defaultScreenshotResult.height,
        },
        transcript: "Open the save menu",
        history: [],
        domSnapshot: defaultScreenshotResult.domSnapshot,
      })

      const ttsPayload = readJsonRequestBody(fetchMock, 2)
      expect(ttsPayload).toEqual({ text: "Click Save" })
    })

    it("uses the browser transcript in auto mode when available", async () => {
      const { services, audioPlayback } = createMockServices({
        liveTranscription: {
          stop: vi
            .fn<() => Promise<string>>()
            .mockResolvedValue("Open the save menu"),
        },
      })
      const client = new CursorBuddyClient(
        "/api",
        { transcription: { mode: "auto" } },
        services,
      )

      const fetchMock = vi.fn()
      vi.stubGlobal("fetch", fetchMock)

      fetchMock
        .mockResolvedValueOnce(createUIStreamResponse(["Click Save"]))
        .mockResolvedValueOnce(
          createBlobResponse(new Blob(["tts"], { type: "audio/mpeg" })),
        )

      client.startListening()
      await client.stopListening()

      expect(client.getSnapshot()).toMatchObject({
        transcript: "Open the save menu",
        response: "Click Save",
      })
      expect(audioPlayback.play).toHaveBeenCalledTimes(1)
      expect(fetchMock).toHaveBeenCalledTimes(2)
      expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/chat")
      expect(fetchMock.mock.calls[1]?.[0]).toBe("/api/tts")
    })

    it("fails in browser mode when browser transcription produces no final transcript", async () => {
      const onError = vi.fn()
      const { services } = createMockServices({
        liveTranscription: {
          stop: vi.fn<() => Promise<string>>().mockResolvedValue(""),
        },
      })
      const client = new CursorBuddyClient(
        "/api",
        { onError, transcription: { mode: "browser" } },
        services,
      )

      const fetchMock = vi.fn()
      vi.stubGlobal("fetch", fetchMock)

      client.startListening()
      await client.stopListening()

      expect(fetchMock).not.toHaveBeenCalled()
      expect(onError).toHaveBeenCalledWith(
        expect.objectContaining({
          message: "Browser transcription did not produce a final transcript",
        }),
      )
      expect(client.getSnapshot()).toMatchObject({
        state: "idle",
        error: expect.objectContaining({
          message: "Browser transcription did not produce a final transcript",
        }),
      })
    })

    it("waits for the full chat response before TTS by default", async () => {
      const { services, audioPlayback, browserSpeech } = createMockServices()
      const client = new CursorBuddyClient("/api", {}, services)
      const encoder = new TextEncoder()
      const chatReads = [
        createDeferred<ReadableStreamReadResult<Uint8Array>>(),
        createDeferred<ReadableStreamReadResult<Uint8Array>>(),
        createDeferred<ReadableStreamReadResult<Uint8Array>>(),
      ]
      const ttsPayloads: string[] = []

      const fetchMock = vi.fn((input: string, init?: RequestInit) => {
        if (input === "/api/transcribe") {
          return Promise.resolve(createJsonResponse({ text: "Help me save" }))
        }

        if (input === "/api/chat") {
          return Promise.resolve(createControlledStreamResponse(chatReads))
        }

        if (input === "/api/tts") {
          const body = JSON.parse(String(init?.body ?? "{}")) as {
            text: string
          }
          ttsPayloads.push(body.text)

          return Promise.resolve(
            createBlobResponse(new Blob(["audio"], { type: "audio/wav" })),
          )
        }

        throw new Error(`Unexpected fetch: ${input}`)
      })
      vi.stubGlobal("fetch", fetchMock)

      client.startListening()
      const stopPromise = client.stopListening()

      chatReads[0]?.resolve({
        done: false,
        value: textDeltaChunk("The first response sentence is long enough. "),
      })

      await vi.waitFor(() => {
        expect(client.getSnapshot().response).toBe(
          "The first response sentence is long enough. ",
        )
      })

      expect(ttsPayloads).toEqual([])
      expect(audioPlayback.play).not.toHaveBeenCalled()
      expect(browserSpeech.speak).not.toHaveBeenCalled()

      chatReads[1]?.resolve({
        done: false,
        value: textDeltaChunk("The second response sentence arrives later."),
      })
      chatReads[2]?.resolve({ done: true, value: undefined })

      await stopPromise

      expect(ttsPayloads).toEqual([
        "The first response sentence is long enough. The second response sentence arrives later.",
      ])
      expect(audioPlayback.play).toHaveBeenCalledTimes(1)
    })

    it("starts chunked server TTS playback before chat streaming fully completes when enabled", async () => {
      const { services, audioPlayback } = createMockServices()
      const client = new CursorBuddyClient(
        "/api",
        { speech: { allowStreaming: true } },
        services,
      )
      const encoder = new TextEncoder()
      const chatReads = [
        createDeferred<ReadableStreamReadResult<Uint8Array>>(),
        createDeferred<ReadableStreamReadResult<Uint8Array>>(),
        createDeferred<ReadableStreamReadResult<Uint8Array>>(),
      ]
      const ttsPayloads: string[] = []

      const fetchMock = vi.fn((input: string, init?: RequestInit) => {
        if (input === "/api/transcribe") {
          return Promise.resolve(createJsonResponse({ text: "Help me save" }))
        }

        if (input === "/api/chat") {
          return Promise.resolve(createControlledStreamResponse(chatReads))
        }

        if (input === "/api/tts") {
          const body = JSON.parse(String(init?.body ?? "{}")) as {
            text: string
          }
          ttsPayloads.push(body.text)

          return Promise.resolve(
            createBlobResponse(new Blob(["audio"], { type: "audio/wav" })),
          )
        }

        throw new Error(`Unexpected fetch: ${input}`)
      })
      vi.stubGlobal("fetch", fetchMock)

      client.startListening()
      const stopPromise = client.stopListening()

      chatReads[0]?.resolve({
        done: false,
        value: textDeltaChunk("The first response sentence is long enough. "),
      })

      await vi.waitFor(() => {
        expect(ttsPayloads).toEqual([
          "The first response sentence is long enough.",
        ])
        expect(audioPlayback.play).toHaveBeenCalledTimes(1)
        expect(client.getSnapshot().state).toBe("responding")
      })

      chatReads[1]?.resolve({
        done: false,
        value: textDeltaChunk("The second response sentence arrives later."),
      })
      chatReads[2]?.resolve({ done: true, value: undefined })

      await stopPromise

      expect(ttsPayloads).toEqual([
        "The first response sentence is long enough.",
        "The second response sentence arrives later.",
      ])
      expect(audioPlayback.play).toHaveBeenCalledTimes(2)
      expect(client.getSnapshot()).toMatchObject({
        state: "idle",
        response:
          "The first response sentence is long enough. The second response sentence arrives later.",
      })
    })

    it("uses browser speech without hitting /tts in browser mode", async () => {
      const { services, audioPlayback, browserSpeech } = createMockServices()
      const client = new CursorBuddyClient(
        "/api",
        { speech: { mode: "browser" } },
        services,
      )

      const fetchMock = vi.fn((input: string) => {
        if (input === "/api/transcribe") {
          return Promise.resolve(
            createJsonResponse({ text: "Open the save menu" }),
          )
        }

        if (input === "/api/chat") {
          return Promise.resolve(createUIStreamResponse(["Click Save"]))
        }

        throw new Error(`Unexpected fetch: ${input}`)
      })
      vi.stubGlobal("fetch", fetchMock)

      client.startListening()
      await client.stopListening()

      expect(browserSpeech.speak).toHaveBeenCalledTimes(1)
      expect(browserSpeech.speak).toHaveBeenCalledWith(
        "Click Save",
        expect.any(AbortSignal),
      )
      expect(audioPlayback.play).not.toHaveBeenCalled()
      expect(fetchMock).toHaveBeenCalledTimes(2)
    })

    it("starts chunked browser speech playback before chat streaming fully completes when enabled", async () => {
      const { services, browserSpeech, audioPlayback } = createMockServices()
      const client = new CursorBuddyClient(
        "/api",
        { speech: { mode: "browser", allowStreaming: true } },
        services,
      )
      const encoder = new TextEncoder()
      const chatReads = [
        createDeferred<ReadableStreamReadResult<Uint8Array>>(),
        createDeferred<ReadableStreamReadResult<Uint8Array>>(),
        createDeferred<ReadableStreamReadResult<Uint8Array>>(),
      ]

      const fetchMock = vi.fn((input: string) => {
        if (input === "/api/transcribe") {
          return Promise.resolve(createJsonResponse({ text: "Help me save" }))
        }

        if (input === "/api/chat") {
          return Promise.resolve(createControlledStreamResponse(chatReads))
        }

        throw new Error(`Unexpected fetch: ${input}`)
      })
      vi.stubGlobal("fetch", fetchMock)

      client.startListening()
      const stopPromise = client.stopListening()

      chatReads[0]?.resolve({
        done: false,
        value: textDeltaChunk("The first response sentence is long enough. "),
      })

      await vi.waitFor(() => {
        expect(browserSpeech.speak).toHaveBeenCalledTimes(1)
        expect(browserSpeech.speak).toHaveBeenCalledWith(
          "The first response sentence is long enough.",
          expect.any(AbortSignal),
        )
        expect(audioPlayback.play).not.toHaveBeenCalled()
      })

      chatReads[1]?.resolve({
        done: false,
        value: textDeltaChunk("The second response sentence arrives later."),
      })
      chatReads[2]?.resolve({ done: true, value: undefined })

      await stopPromise

      expect(browserSpeech.speak).toHaveBeenCalledTimes(2)
      expect(fetchMock).toHaveBeenCalledTimes(2)
    })

    it("falls back to server speech in auto mode when browser speech fails", async () => {
      const { services, audioPlayback, browserSpeech } = createMockServices({
        browserSpeech: {
          speak: vi
            .fn<(text: string, signal?: AbortSignal) => Promise<void>>()
            .mockRejectedValue(new Error("browser speech exploded")),
        },
      })
      const client = new CursorBuddyClient(
        "/api",
        { speech: { mode: "auto" } },
        services,
      )

      const fetchMock = vi.fn((input: string, init?: RequestInit) => {
        if (input === "/api/transcribe") {
          return Promise.resolve(
            createJsonResponse({ text: "Open the save menu" }),
          )
        }

        if (input === "/api/chat") {
          return Promise.resolve(createUIStreamResponse(["Click Save"]))
        }

        if (input === "/api/tts") {
          return Promise.resolve(
            createBlobResponse(new Blob(["audio"], { type: "audio/wav" })),
          )
        }

        throw new Error(`Unexpected fetch: ${input}`)
      })
      vi.stubGlobal("fetch", fetchMock)

      client.startListening()
      await client.stopListening()

      expect(browserSpeech.speak).toHaveBeenCalledTimes(1)
      expect(audioPlayback.play).toHaveBeenCalledTimes(1)
      expect(fetchMock).toHaveBeenCalledTimes(3)
      expect(fetchMock.mock.calls[2]?.[0]).toBe("/api/tts")
    })

    it("fails in browser speech mode when browser speech is unavailable", async () => {
      const onError = vi.fn()
      const { services } = createMockServices({
        browserSpeech: {
          isAvailable: vi.fn<() => boolean>().mockReturnValue(false),
        },
      })
      const client = new CursorBuddyClient(
        "/api",
        { onError, speech: { mode: "browser" } },
        services,
      )

      const fetchMock = vi.fn((input: string) => {
        if (input === "/api/transcribe") {
          return Promise.resolve(
            createJsonResponse({ text: "Open the save menu" }),
          )
        }

        throw new Error(`Unexpected fetch: ${input}`)
      })
      vi.stubGlobal("fetch", fetchMock)

      client.startListening()
      await client.stopListening()

      expect(fetchMock).toHaveBeenCalledTimes(1)
      expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/transcribe")
      expect(onError).toHaveBeenCalledWith(
        expect.objectContaining({
          message: "Browser speech is not supported",
        }),
      )
      expect(client.getSnapshot()).toMatchObject({
        state: "idle",
        error: expect.objectContaining({
          message: "Browser speech is not supported",
        }),
      })
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
        liveTranscript: "",
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
        .mockResolvedValueOnce(createUIStreamResponse(["   "]))

      client.startListening()
      await client.stopListening()

      expect(audioPlayback.play).not.toHaveBeenCalled()
      expect(client.getSnapshot()).toMatchObject({
        state: "idle",
        liveTranscript: "",
        transcript: "hello",
        response: "",
      })
      expect($conversationHistory.get()).toEqual([
        { role: "user", content: "hello" },
        { role: "assistant", content: "" },
      ])
    })

    it("fails the turn when any sentence TTS request fails", async () => {
      const onError = vi.fn()
      const { services, audioPlayback } = createMockServices({
        audioPlayback: {
          play: vi.fn<(blob: Blob, signal?: AbortSignal) => Promise<void>>(
            (_blob, signal) =>
              new Promise<void>((resolve) => {
                if (signal?.aborted) {
                  resolve()
                  return
                }

                signal?.addEventListener("abort", () => resolve(), {
                  once: true,
                })
              }),
          ),
        },
      })
      const streamingClient = new CursorBuddyClient(
        "/api",
        { onError, speech: { allowStreaming: true } },
        services,
      )

      const fetchMock = vi.fn((input: string, init?: RequestInit) => {
        if (input === "/api/transcribe") {
          return Promise.resolve(
            createJsonResponse({ text: "Explain what to click" }),
          )
        }

        if (input === "/api/chat") {
          return Promise.resolve(
            createUIStreamResponse([
              "The first response sentence is long enough. The second response sentence fails hard.",
            ]),
          )
        }

        if (input === "/api/tts") {
          const body = JSON.parse(String(init?.body ?? "{}")) as {
            text: string
          }

          if (body.text.startsWith("The first response sentence")) {
            return Promise.resolve(
              createBlobResponse(new Blob(["audio"], { type: "audio/wav" })),
            )
          }

          return Promise.resolve({ ok: false })
        }

        throw new Error(`Unexpected fetch: ${input}`)
      })
      vi.stubGlobal("fetch", fetchMock)

      streamingClient.startListening()
      await streamingClient.stopListening()

      expect(onError).toHaveBeenCalledWith(
        expect.objectContaining({ message: "TTS request failed" }),
      )
      expect(streamingClient.getSnapshot()).toMatchObject({
        state: "idle",
        error: expect.objectContaining({ message: "TTS request failed" }),
      })
      expect(audioPlayback.stop).toHaveBeenCalled()
      expect($conversationHistory.get()).toEqual([])
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

    it("starts a fresh screenshot capture when interrupted", async () => {
      const { services, screenCapture } = createMockServices()
      const client = new CursorBuddyClient("/api", {}, services)
      const screenshotDeferred = createDeferred<ScreenshotResult>()

      // First screenshot hangs
      screenCapture.capture
        .mockReturnValueOnce(screenshotDeferred.promise)
        .mockResolvedValueOnce({
          ...defaultScreenshotResult,
          imageData: "data:image/jpeg;base64,second-screenshot",
        })

      const fetchMock = vi.fn()
      vi.stubGlobal("fetch", fetchMock)

      fetchMock
        .mockResolvedValueOnce(createJsonResponse({ text: "hello" }))
        .mockResolvedValueOnce(createUIStreamResponse(["Hi"]))
        .mockResolvedValueOnce(
          createBlobResponse(new Blob(["tts"], { type: "audio/mpeg" })),
        )

      // Start first session
      client.startListening()
      expect(screenCapture.capture).toHaveBeenCalledTimes(1)

      // Interrupt with a new session
      client.startListening()
      expect(screenCapture.capture).toHaveBeenCalledTimes(2)

      // Complete the second session
      await client.stopListening()

      // Verify the second screenshot was used
      const chatPayload = readJsonRequestBody(fetchMock, 1)
      expect(chatPayload.screenshot).toBe(
        "data:image/jpeg;base64,second-screenshot",
      )
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
      // Chat streams partial response with point tool call
      fetchMock.mockResolvedValueOnce(
        createUIStreamResponse(["This is the submit button "], {
          toolName: "point",
          args: { type: "marker", markerId: 5, label: "Submit" },
        }),
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
        .mockResolvedValueOnce(createUIStreamResponse(["First answer"]))
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
        liveTranscript: "",
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
        .mockResolvedValueOnce(createUIStreamResponse(["partial response"]))
        .mockResolvedValueOnce(
          createBlobResponse(new Blob(["tts"], { type: "audio/mpeg" })),
        )
      await client.stopListening()

      client.reset()

      expect(client.getSnapshot()).toMatchObject({
        state: "idle",
        liveTranscript: "",
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
