import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { AudioPlaybackService } from "../services/audio-playback"

// Mock HTMLAudioElement
class MockAudio {
  src: string = ""
  onended: (() => void) | null = null
  onerror: (() => void) | null = null
  paused: boolean = true

  play = vi.fn().mockImplementation(() => {
    this.paused = false
    return Promise.resolve()
  })

  pause = vi.fn().mockImplementation(() => {
    this.paused = true
  })
}

// Mock URL API
const mockRevokeObjectURL = vi.fn()
const mockCreateObjectURL = vi.fn().mockReturnValue("blob:mock-url")

describe("AudioPlaybackService", () => {
  let service: AudioPlaybackService
  let originalAudio: typeof Audio
  let originalURL: typeof URL

  beforeEach(() => {
    // Store originals
    originalAudio = globalThis.Audio
    originalURL = globalThis.URL

    // Mock Audio constructor
    globalThis.Audio = MockAudio as any

    // Mock URL
    globalThis.URL = {
      ...originalURL,
      createObjectURL: mockCreateObjectURL,
      revokeObjectURL: mockRevokeObjectURL,
    } as any

    service = new AudioPlaybackService()

    vi.clearAllMocks()
  })

  afterEach(() => {
    globalThis.Audio = originalAudio
    globalThis.URL = originalURL
  })

  describe("play", () => {
    it("creates object URL from blob", async () => {
      const blob = new Blob(["audio data"], { type: "audio/wav" })

      // Start play but don't await
      const playPromise = service.play(blob)

      expect(mockCreateObjectURL).toHaveBeenCalledWith(blob)

      // Trigger end to resolve promise
      const audio = (service as any).audio
      audio?.onended?.()
      await playPromise
    })

    it("stops previous audio before playing new one", async () => {
      const blob1 = new Blob(["audio 1"], { type: "audio/wav" })
      const blob2 = new Blob(["audio 2"], { type: "audio/wav" })

      // Start first audio
      const promise1 = service.play(blob1)
      const audio1 = (service as any).audio

      // Start second audio (should stop first)
      const promise2 = service.play(blob2)
      const audio2 = (service as any).audio

      expect(audio1.pause).toHaveBeenCalled()

      await expect(promise1).resolves.toBeUndefined()

      // Resolve second audio
      audio2?.onended?.()
      await promise2
    })

    it("revokes URL on completion", async () => {
      const blob = new Blob(["audio"], { type: "audio/wav" })

      const playPromise = service.play(blob)
      const audio = (service as any).audio
      audio?.onended?.()

      await playPromise

      expect(mockRevokeObjectURL).toHaveBeenCalledWith("blob:mock-url")
    })

    it("rejects on playback error", async () => {
      const blob = new Blob(["audio"], { type: "audio/wav" })

      const playPromise = service.play(blob)
      const audio = (service as any).audio
      audio?.onerror?.()

      await expect(playPromise).rejects.toThrow("Audio playback failed")
    })

    it("returns immediately if signal is already aborted", async () => {
      const blob = new Blob(["audio"], { type: "audio/wav" })
      const controller = new AbortController()
      controller.abort()

      await service.play(blob, controller.signal)

      // Should not have created audio
      expect((service as any).audio).toBeNull()
    })

    it("stops playback when signal is aborted", async () => {
      const blob = new Blob(["audio"], { type: "audio/wav" })
      const controller = new AbortController()

      const playPromise = service.play(blob, controller.signal)
      const audio = (service as any).audio

      // Abort while playing
      controller.abort()

      expect(audio.pause).toHaveBeenCalled()
      await expect(playPromise).resolves.toBeUndefined()
    })
  })

  describe("stop", () => {
    it("pauses and clears audio", async () => {
      const blob = new Blob(["audio"], { type: "audio/wav" })

      const playPromise = service.play(blob)
      const audio = (service as any).audio

      service.stop()

      expect(audio.pause).toHaveBeenCalled()
      expect((service as any).audio).toBeNull()
      await expect(playPromise).resolves.toBeUndefined()
    })

    it("revokes object URL", async () => {
      const blob = new Blob(["audio"], { type: "audio/wav" })

      service.play(blob)
      service.stop()

      expect(mockRevokeObjectURL).toHaveBeenCalledWith("blob:mock-url")
    })

    it("is safe to call when nothing is playing", () => {
      expect(() => service.stop()).not.toThrow()
    })

    it("clears event handlers", async () => {
      const blob = new Blob(["audio"], { type: "audio/wav" })

      service.play(blob)
      const audio = (service as any).audio

      service.stop()

      expect(audio.onended).toBeNull()
      expect(audio.onerror).toBeNull()
    })
  })
})
