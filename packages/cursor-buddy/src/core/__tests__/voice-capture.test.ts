import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { VoiceCaptureService } from "../services/voice-capture"

// Mock AudioContext and related APIs
const mockMediaStreamTrack = {
  stop: vi.fn(),
}

const mockMediaStream = {
  getTracks: vi.fn().mockReturnValue([mockMediaStreamTrack]),
}

const mockWorkletPort = {
  onmessage: null as ((event: MessageEvent) => void) | null,
  postMessage: vi.fn((message: { type?: string }) => {
    if (message.type === "flush") {
      mockWorkletPort.onmessage?.({
        data: { type: "flush-complete" },
      } as MessageEvent)
    }
  }),
}

const mockWorkletNode = {
  port: mockWorkletPort,
  disconnect: vi.fn(),
  connect: vi.fn(),
}

const mockSourceNode = {
  connect: vi.fn(),
  disconnect: vi.fn(),
}

const mockGainNode = {
  gain: { value: 1 },
  connect: vi.fn(),
  disconnect: vi.fn(),
}

const mockAudioContext = {
  sampleRate: 16000,
  destination: {},
  audioWorklet: {
    addModule: vi.fn().mockResolvedValue(undefined),
  },
  createMediaStreamSource: vi.fn().mockReturnValue(mockSourceNode),
  createGain: vi.fn().mockReturnValue(mockGainNode),
  resume: vi.fn().mockResolvedValue(undefined),
  close: vi.fn().mockResolvedValue(undefined),
}

// Mock navigator.mediaDevices
const mockGetUserMedia = vi.fn().mockResolvedValue(mockMediaStream)

// Mock AudioWorkletNode constructor
class MockAudioWorkletNode {
  port = mockWorkletPort
  disconnect = vi.fn()
  connect = vi.fn()

  constructor() {
    Object.assign(this, mockWorkletNode)
  }
}

describe("VoiceCaptureService", () => {
  let service: VoiceCaptureService
  let originalNavigator: Navigator
  let originalAudioContext: typeof AudioContext
  let originalAudioWorkletNode: typeof AudioWorkletNode

  beforeEach(() => {
    // Store originals
    originalNavigator = globalThis.navigator
    originalAudioContext = globalThis.AudioContext
    originalAudioWorkletNode = globalThis.AudioWorkletNode

    // Mock navigator.mediaDevices
    Object.defineProperty(globalThis, "navigator", {
      value: {
        mediaDevices: {
          getUserMedia: mockGetUserMedia,
        },
      },
      configurable: true,
    })

    // Mock AudioContext
    globalThis.AudioContext = vi
      .fn()
      .mockImplementation(() => mockAudioContext) as any

    // Mock AudioWorkletNode
    globalThis.AudioWorkletNode = MockAudioWorkletNode as any

    service = new VoiceCaptureService()

    vi.clearAllMocks()
  })

  afterEach(() => {
    Object.defineProperty(globalThis, "navigator", {
      value: originalNavigator,
      configurable: true,
    })
    globalThis.AudioContext = originalAudioContext
    globalThis.AudioWorkletNode = originalAudioWorkletNode
  })

  describe("onLevel", () => {
    it("registers callback for audio level updates", () => {
      const callback = vi.fn()
      service.onLevel(callback)

      // Callback is stored internally
      expect((service as any).levelCallback).toBe(callback)
    })
  })

  describe("start", () => {
    it("requests microphone access", async () => {
      await service.start()

      expect(mockGetUserMedia).toHaveBeenCalledWith({
        audio: {
          sampleRate: 16000,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
        },
      })
    })

    it("creates AudioContext with correct sample rate", async () => {
      await service.start()

      expect(AudioContext).toHaveBeenCalledWith({ sampleRate: 16000 })
    })

    it("loads audio worklet module", async () => {
      await service.start()

      expect(mockAudioContext.audioWorklet.addModule).toHaveBeenCalled()
    })

    it("connects source to worklet node", async () => {
      await service.start()

      expect(mockSourceNode.connect).toHaveBeenCalled()
    })

    it("clears previous chunks", async () => {
      // Add fake chunks
      ;(service as any).chunks = [new Float32Array([1, 2, 3])]

      await service.start()

      expect((service as any).chunks).toHaveLength(0)
    })

    it("throws when microphone access is denied", async () => {
      mockGetUserMedia.mockRejectedValueOnce(new Error("Permission denied"))

      await expect(service.start()).rejects.toThrow("Permission denied")
    })
  })

  describe("stop", () => {
    it("stops media stream tracks", async () => {
      await service.start()
      await service.stop()

      expect(mockMediaStreamTrack.stop).toHaveBeenCalled()
    })

    it("disconnects worklet node", async () => {
      await service.start()
      await service.stop()

      expect(mockWorkletNode.disconnect).toHaveBeenCalled()
    })

    it("closes audio context", async () => {
      await service.start()
      await service.stop()

      expect(mockAudioContext.close).toHaveBeenCalled()
    })

    it("resets audio level to zero", async () => {
      const levelCallback = vi.fn()
      service.onLevel(levelCallback)

      await service.start()
      await service.stop()

      expect(levelCallback).toHaveBeenCalledWith(0)
    })

    it("returns a WAV blob", async () => {
      await service.start()
      const blob = await service.stop()

      expect(blob).toBeInstanceOf(Blob)
      expect(blob.type).toBe("audio/wav")
    })
  })

  describe("dispose", () => {
    it("preserves the level callback so the service can be reused", () => {
      const callback = vi.fn()
      service.onLevel(callback)

      service.dispose()

      expect((service as any).levelCallback).toBe(callback)
      expect(callback).toHaveBeenCalledWith(0)
    })
  })

  describe("audio data handling", () => {
    it("collects audio chunks from worklet messages", async () => {
      await service.start()

      // Simulate worklet sending audio data
      const audioData = new Float32Array([0.1, 0.2, 0.3])
      mockWorkletPort.onmessage?.({
        data: { type: "audio", data: audioData },
      } as MessageEvent)

      expect((service as any).chunks).toHaveLength(1)
      expect((service as any).chunks[0]).toBe(audioData)
    })

    it("maps ordinary speech RMS into a usable visualization range", async () => {
      const levelCallback = vi.fn()
      service.onLevel(levelCallback)

      await service.start()

      // Simulate worklet sending level data
      mockWorkletPort.onmessage?.({
        data: { type: "level", rms: 0.1 },
      } as MessageEvent)

      expect(levelCallback).toHaveBeenCalled()
      const calledLevel = levelCallback.mock.calls[0][0]
      expect(calledLevel).toBeGreaterThan(0.4)
      expect(calledLevel).toBeLessThan(1)
    })

    it("still surfaces quiet speech above the noise floor", async () => {
      const levelCallback = vi.fn()
      service.onLevel(levelCallback)

      await service.start()

      mockWorkletPort.onmessage?.({
        data: { type: "level", rms: 0.003 },
      } as MessageEvent)

      expect(levelCallback).toHaveBeenCalled()
      expect(levelCallback.mock.calls[0][0]).toBeGreaterThan(0.1)
    })

    it("smooths rapid level drops instead of snapping flat", async () => {
      const levelCallback = vi.fn()
      service.onLevel(levelCallback)

      await service.start()

      mockWorkletPort.onmessage?.({
        data: { type: "level", rms: 0.12 },
      } as MessageEvent)
      mockWorkletPort.onmessage?.({
        data: { type: "level", rms: 0.01 },
      } as MessageEvent)

      expect(levelCallback).toHaveBeenCalledTimes(2)
      const firstLevel = levelCallback.mock.calls[0][0]
      const secondLevel = levelCallback.mock.calls[1][0]

      expect(firstLevel).toBeGreaterThan(secondLevel)
      expect(secondLevel).toBeGreaterThan(0)
    })

    it("keeps very loud input within range", async () => {
      const levelCallback = vi.fn()
      service.onLevel(levelCallback)

      await service.start()

      mockWorkletPort.onmessage?.({
        data: { type: "level", rms: 0.5 },
      } as MessageEvent)

      const calledLevel = levelCallback.mock.calls[0][0]
      expect(calledLevel).toBeLessThanOrEqual(1)
      expect(calledLevel).toBeGreaterThan(0.6)
    })
  })

  describe("dispose", () => {
    it("cleans up all resources", async () => {
      await service.start()
      service.dispose()

      expect(mockMediaStreamTrack.stop).toHaveBeenCalled()
      expect(mockWorkletNode.disconnect).toHaveBeenCalled()
      expect((service as any).chunks).toHaveLength(0)
      expect((service as any).levelCallback).toBeNull()
    })

    it("is safe to call without starting", () => {
      expect(() => service.dispose()).not.toThrow()
    })

    it("is safe to call multiple times", async () => {
      await service.start()

      expect(() => {
        service.dispose()
        service.dispose()
      }).not.toThrow()
    })
  })
})
