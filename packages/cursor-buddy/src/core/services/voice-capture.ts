import { createWorkletBlobURL } from "../utils/audio-worklet"
import { mergeAudioChunks, encodeWAV } from "../utils/audio"

const SAMPLE_RATE = 16000
const AUDIO_LEVEL_BOOST = 10.2

/**
 * Framework-agnostic service for voice capture using AudioWorkletNode.
 */
export class VoiceCaptureService {
  private audioContext: AudioContext | null = null
  private workletNode: AudioWorkletNode | null = null
  private stream: MediaStream | null = null
  private chunks: Float32Array[] = []
  private levelCallback: ((level: number) => void) | null = null

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

    // Load worklet from blob URL
    const workletURL = createWorkletBlobURL()
    await audioContext.audioWorklet.addModule(workletURL)

    const source = audioContext.createMediaStreamSource(stream)
    const workletNode = new AudioWorkletNode(
      audioContext,
      "audio-capture-processor"
    )
    this.workletNode = workletNode

    workletNode.port.onmessage = (event) => {
      const { type, data, rms } = event.data

      if (type === "audio") {
        this.chunks.push(data)
      } else if (type === "level" && this.levelCallback) {
        // Boost audio level for better visualization
        const boostedLevel = Math.min(rms * AUDIO_LEVEL_BOOST, 1)
        this.levelCallback(boostedLevel)
      }
    }

    source.connect(workletNode)
    // Don't connect to destination - we don't want to play back the mic
  }

  /**
   * Stop recording and return the captured audio as a WAV blob.
   */
  async stop(): Promise<Blob> {
    // Stop the media stream tracks
    if (this.stream) {
      this.stream.getTracks().forEach((track) => track.stop())
      this.stream = null
    }

    // Disconnect and close audio nodes
    if (this.workletNode) {
      this.workletNode.disconnect()
      this.workletNode = null
    }

    if (this.audioContext) {
      await this.audioContext.close()
      this.audioContext = null
    }

    // Reset audio level
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
    if (this.workletNode) {
      this.workletNode.disconnect()
      this.workletNode = null
    }
    if (this.audioContext) {
      this.audioContext.close()
      this.audioContext = null
    }
    this.chunks = []
    this.levelCallback = null
  }
}
