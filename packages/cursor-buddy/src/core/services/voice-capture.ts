import type { VoiceCapturePort } from "../types"
import { encodeWAV, mergeAudioChunks } from "../utils/audio"
import { createWorkletBlobURL } from "../utils/audio-worklet"

const SAMPLE_RATE = 16000
const AUDIO_LEVEL_NOISE_GATE = 0.0005
const AUDIO_LEVEL_INPUT_GAIN = 600
const AUDIO_LEVEL_ATTACK = 0.7
const AUDIO_LEVEL_RELEASE = 0.25

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

function normalizeAudioLevel(rms: number): number {
  const gatedRms = Math.max(0, rms - AUDIO_LEVEL_NOISE_GATE)
  return clamp(
    Math.log1p(gatedRms * AUDIO_LEVEL_INPUT_GAIN) /
      Math.log1p(AUDIO_LEVEL_INPUT_GAIN),
    0,
    1,
  )
}

function smoothAudioLevel(current: number, target: number): number {
  const smoothing = target > current ? AUDIO_LEVEL_ATTACK : AUDIO_LEVEL_RELEASE
  return current + (target - current) * smoothing
}

/**
 * Framework-agnostic service for voice capture using AudioWorkletNode.
 */
export class VoiceCaptureService implements VoiceCapturePort {
  private audioContext: AudioContext | null = null
  private workletNode: AudioWorkletNode | null = null
  private sourceNode: MediaStreamAudioSourceNode | null = null
  private silentGainNode: GainNode | null = null
  private stream: MediaStream | null = null
  private chunks: Float32Array[] = []
  private levelCallback: ((level: number) => void) | null = null
  private visualLevel = 0
  private flushResolve: (() => void) | null = null

  /**
   * Register a callback to receive audio level updates (0-1).
   * Called at ~60fps during recording for waveform visualization.
   */
  onLevel(callback: (level: number) => void): void {
    this.levelCallback = callback
  }

  /**
   * Start recording audio from the microphone.
   * @throws Error if microphone access is denied
   */
  async start(): Promise<void> {
    this.chunks = []
    this.visualLevel = 0

    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        sampleRate: SAMPLE_RATE,
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
      },
    })
    this.stream = stream

    const audioContext = new AudioContext({ sampleRate: SAMPLE_RATE })
    this.audioContext = audioContext
    await audioContext.resume()

    // Load worklet from blob URL
    const workletURL = createWorkletBlobURL()
    await audioContext.audioWorklet.addModule(workletURL)

    const source = audioContext.createMediaStreamSource(stream)
    this.sourceNode = source
    const workletNode = new AudioWorkletNode(
      audioContext,
      "audio-capture-processor",
    )
    this.workletNode = workletNode
    const silentGainNode = audioContext.createGain()
    silentGainNode.gain.value = 0
    this.silentGainNode = silentGainNode

    workletNode.port.onmessage = (event) => {
      const { type, data, rms, peak } = event.data

      if (type === "audio") {
        this.chunks.push(data)
      } else if (type === "level" && this.levelCallback) {
        const signalLevel = Math.max(rms ?? 0, (peak ?? 0) * 0.6)
        const targetLevel = normalizeAudioLevel(signalLevel)
        this.visualLevel = smoothAudioLevel(this.visualLevel, targetLevel)
        this.levelCallback(this.visualLevel)
      } else if (type === "flush-complete") {
        this.flushResolve?.()
        this.flushResolve = null
      }
    }

    source.connect(workletNode)
    workletNode.connect(silentGainNode)
    silentGainNode.connect(audioContext.destination)
  }

  /**
   * Stop recording and return the captured audio as a WAV blob.
   */
  async stop(): Promise<Blob> {
    await this.flushPendingAudio()

    // Stop the media stream tracks
    if (this.stream) {
      this.stream.getTracks().forEach((track) => track.stop())
      this.stream = null
    }

    // Disconnect and close audio nodes
    if (this.sourceNode) {
      this.sourceNode.disconnect()
      this.sourceNode = null
    }

    if (this.workletNode) {
      this.workletNode.disconnect()
      this.workletNode = null
    }

    if (this.silentGainNode) {
      this.silentGainNode.disconnect()
      this.silentGainNode = null
    }

    if (this.audioContext) {
      await this.audioContext.close()
      this.audioContext = null
    }

    // Reset audio level
    this.visualLevel = 0
    this.levelCallback?.(0)

    // Encode captured audio as WAV
    const audioData = mergeAudioChunks(this.chunks)
    const wavBlob = encodeWAV(audioData, SAMPLE_RATE)

    this.chunks = []

    return wavBlob
  }

  /**
   * Clean up all resources.
   */
  dispose(): void {
    if (this.stream) {
      this.stream.getTracks().forEach((track) => track.stop())
      this.stream = null
    }
    if (this.sourceNode) {
      this.sourceNode.disconnect()
      this.sourceNode = null
    }
    if (this.workletNode) {
      this.workletNode.disconnect()
      this.workletNode = null
    }
    if (this.silentGainNode) {
      this.silentGainNode.disconnect()
      this.silentGainNode = null
    }
    if (this.audioContext) {
      this.audioContext.close()
      this.audioContext = null
    }
    this.chunks = []
    this.visualLevel = 0
    this.flushResolve = null
    this.levelCallback = null
  }

  private async flushPendingAudio(): Promise<void> {
    if (!this.workletNode) return

    await new Promise<void>((resolve) => {
      const timeoutId = setTimeout(() => {
        this.flushResolve = null
        resolve()
      }, 50)

      this.flushResolve = () => {
        clearTimeout(timeoutId)
        resolve()
      }

      this.workletNode?.port.postMessage({ type: "flush" })
    })
  }
}
