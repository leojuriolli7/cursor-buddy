import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { LiveTranscriptionService } from "../services/live-transcription"

type MockRecognitionResult = {
  isFinal: boolean
  length: number
  0: { transcript: string }
}

type MockRecognitionGlobal = typeof globalThis & {
  SpeechRecognition?: new () => MockSpeechRecognition
  webkitSpeechRecognition?: new () => MockSpeechRecognition
}

class MockSpeechRecognition {
  continuous = false
  interimResults = false
  lang = ""
  maxAlternatives = 1
  onend: (() => void) | null = null
  onerror: ((event: { error?: string; message?: string }) => void) | null = null
  onresult: ((event: { results: MockRecognitionResult[] }) => void) | null =
    null
  onstart: (() => void) | null = null
  abort = vi.fn()
  start = vi.fn()
  stop = vi.fn()

  emitStart(): void {
    this.onstart?.()
  }

  emitResult(results: MockRecognitionResult[]): void {
    this.onresult?.({ results })
  }

  emitError(error: string, message?: string): void {
    this.onerror?.({ error, message })
  }

  emitEnd(): void {
    this.onend?.()
  }
}

describe("LiveTranscriptionService", () => {
  let originalSpeechRecognition: MockRecognitionGlobal["SpeechRecognition"]
  let originalWebkitSpeechRecognition:
    | MockRecognitionGlobal["webkitSpeechRecognition"]
    | undefined
  let lastRecognition: MockSpeechRecognition | null

  beforeEach(() => {
    const globalScope = globalThis as MockRecognitionGlobal
    originalSpeechRecognition = globalScope.SpeechRecognition
    originalWebkitSpeechRecognition = globalScope.webkitSpeechRecognition
    lastRecognition = null

    globalScope.SpeechRecognition = vi.fn(() => {
      lastRecognition = new MockSpeechRecognition()
      return lastRecognition
    }) as any
  })

  afterEach(() => {
    const globalScope = globalThis as MockRecognitionGlobal
    globalScope.SpeechRecognition = originalSpeechRecognition
    globalScope.webkitSpeechRecognition = originalWebkitSpeechRecognition

    vi.restoreAllMocks()
  })

  it("reports support when a speech recognition constructor is available", () => {
    const service = new LiveTranscriptionService()

    expect(service.isAvailable()).toBe(true)
  })

  it("rejects start when browser transcription is unsupported", async () => {
    ;(globalThis as MockRecognitionGlobal).SpeechRecognition = undefined

    const service = new LiveTranscriptionService()

    await expect(service.start()).rejects.toThrow(
      "Browser transcription is not supported",
    )
  })

  it("emits live transcripts from recognition results", async () => {
    const callback = vi.fn()
    const service = new LiveTranscriptionService()
    service.onPartial(callback)

    const startPromise = service.start()
    lastRecognition?.emitStart()
    await startPromise

    lastRecognition?.emitResult([
      {
        0: { transcript: "Open" },
        isFinal: true,
        length: 1,
      },
      {
        0: { transcript: "the menu" },
        isFinal: false,
        length: 1,
      },
    ])

    expect(callback).toHaveBeenLastCalledWith("Open the menu")
  })

  it("resolves the final transcript when stopped cleanly", async () => {
    const service = new LiveTranscriptionService()

    const startPromise = service.start()
    lastRecognition?.emitStart()
    await startPromise

    lastRecognition?.emitResult([
      {
        0: { transcript: "Open the menu" },
        isFinal: true,
        length: 1,
      },
    ])

    const stopPromise = service.stop()

    expect(lastRecognition?.stop).toHaveBeenCalledTimes(1)

    lastRecognition?.emitEnd()

    await expect(stopPromise).resolves.toBe("Open the menu")
  })

  it("rejects stop when the recognition session errors", async () => {
    const service = new LiveTranscriptionService()

    const startPromise = service.start()
    lastRecognition?.emitStart()
    await startPromise

    const stopPromise = service.stop()
    lastRecognition?.emitError("network")
    lastRecognition?.emitEnd()

    await expect(stopPromise).rejects.toThrow(
      "Browser transcription failed: network",
    )
  })
})
