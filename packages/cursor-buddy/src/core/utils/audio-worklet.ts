/**
 * AudioWorklet processor code for voice capture.
 * Inlined as a blob URL to avoid separate file serving requirements.
 */
const workletCode = `
class AudioCaptureProcessor extends AudioWorkletProcessor {
  constructor() {
    super()
    this.isRecording = true
  }

  process(inputs) {
    if (!this.isRecording) return false

    const input = inputs[0]
    if (input && input.length > 0) {
      const channelData = input[0]

      // Send audio data to main thread
      this.port.postMessage({
        type: "audio",
        data: new Float32Array(channelData)
      })

      // Calculate RMS for audio level visualization
      let sum = 0
      for (let i = 0; i < channelData.length; i++) {
        sum += channelData[i] * channelData[i]
      }
      const rms = Math.sqrt(sum / channelData.length)
      this.port.postMessage({ type: "level", rms })
    }

    return true
  }
}

registerProcessor("audio-capture-processor", AudioCaptureProcessor)
`

let cachedBlobURL: string | null = null

/**
 * Create a blob URL for the audio worklet processor.
 * Caches the URL to avoid creating multiple blobs.
 */
export function createWorkletBlobURL(): string {
  if (!cachedBlobURL) {
    const blob = new Blob([workletCode], { type: "application/javascript" })
    cachedBlobURL = URL.createObjectURL(blob)
  }
  return cachedBlobURL
}

/**
 * Clean up the cached worklet blob URL.
 * Call this when the app unmounts if needed.
 */
export function revokeWorkletBlobURL(): void {
  if (cachedBlobURL) {
    URL.revokeObjectURL(cachedBlobURL)
    cachedBlobURL = null
  }
}
