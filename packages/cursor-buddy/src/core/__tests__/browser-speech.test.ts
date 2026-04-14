import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { BrowserSpeechService } from "../services/browser-speech"

type MockBrowserSpeechGlobal = typeof globalThis & {
  speechSynthesis?: MockSpeechSynthesis
  SpeechSynthesisUtterance?: new (text: string) => MockSpeechSynthesisUtterance
}

class MockSpeechSynthesisUtterance {
  lang = ""
  onend: (() => void) | null = null
  onerror: ((event: { error?: string }) => void) | null = null

  constructor(public text: string) {}

  emitEnd(): void {
    this.onend?.()
  }

  emitError(error: string): void {
    this.onerror?.({ error })
  }
}

class MockSpeechSynthesis {
  cancel = vi.fn()
  speak = vi.fn<(utterance: MockSpeechSynthesisUtterance) => void>()
}

describe("BrowserSpeechService", () => {
  let originalSpeechSynthesis: MockBrowserSpeechGlobal["speechSynthesis"]
  let originalSpeechSynthesisUtterance:
    | MockBrowserSpeechGlobal["SpeechSynthesisUtterance"]
    | undefined
  let speechSynthesis: MockSpeechSynthesis
  let utterances: MockSpeechSynthesisUtterance[]

  beforeEach(() => {
    const globalScope = globalThis as MockBrowserSpeechGlobal
    originalSpeechSynthesis = globalScope.speechSynthesis
    originalSpeechSynthesisUtterance = globalScope.SpeechSynthesisUtterance

    speechSynthesis = new MockSpeechSynthesis()
    utterances = []

    ;(globalScope as any).speechSynthesis = speechSynthesis
    ;(globalScope as any).SpeechSynthesisUtterance = vi.fn((text: string) => {
      const utterance = new MockSpeechSynthesisUtterance(text)
      utterances.push(utterance)
      return utterance
    })
  })

  afterEach(() => {
    const globalScope = globalThis as MockBrowserSpeechGlobal
    ;(globalScope as any).speechSynthesis = originalSpeechSynthesis
    ;(globalScope as any).SpeechSynthesisUtterance =
      originalSpeechSynthesisUtterance

    vi.restoreAllMocks()
  })

  it("reports support when the browser speech globals are available", () => {
    const service = new BrowserSpeechService()

    expect(service.isAvailable()).toBe(true)
  })

  it("rejects speak when browser speech is unsupported", async () => {
    ;(globalThis as any).speechSynthesis = undefined

    const service = new BrowserSpeechService()

    await expect(service.speak("hello")).rejects.toThrow(
      "Browser speech is not supported",
    )
  })

  it("speaks text and resolves when the utterance ends", async () => {
    const service = new BrowserSpeechService()

    const speakPromise = service.speak("Click save")

    expect(speechSynthesis.speak).toHaveBeenCalledTimes(1)
    expect(utterances[0]?.text).toBe("Click save")

    utterances[0]?.emitEnd()

    await expect(speakPromise).resolves.toBeUndefined()
  })

  it("rejects when the utterance errors", async () => {
    const service = new BrowserSpeechService()

    const speakPromise = service.speak("Click save")
    utterances[0]?.emitError("interrupted")

    await expect(speakPromise).rejects.toThrow(
      "Browser speech failed: interrupted",
    )
  })

  it("does not cancel global speech when starting a new segment after the previous one ended", async () => {
    const service = new BrowserSpeechService()

    const firstSpeakPromise = service.speak("First segment")
    utterances[0]?.emitEnd()
    await firstSpeakPromise

    const secondSpeakPromise = service.speak("Second segment")

    expect(speechSynthesis.cancel).not.toHaveBeenCalled()
    utterances[1]?.emitEnd()
    await secondSpeakPromise
  })

  it("resolves cleanly when stopped", async () => {
    const service = new BrowserSpeechService()

    const speakPromise = service.speak("Click save")
    service.stop()

    expect(speechSynthesis.cancel).toHaveBeenCalledTimes(1)
    await expect(speakPromise).resolves.toBeUndefined()
  })
})
