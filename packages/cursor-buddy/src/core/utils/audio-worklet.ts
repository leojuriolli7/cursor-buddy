/**
 * AudioWorklet processor code for voice capture.
 * Inlined as a blob URL to avoid separate file serving requirements.
 */
const workletCode = `
class AudioCaptureProcessor extends AudioWorkletProcessor {
  constructor() {
    super()
    this.isRecording = true
    this.audioChunkSize = 2048
    this.audioBuffer = new Float32Array(this.audioChunkSize)
    this.audioBufferIndex = 0
    this.levelFramesPerUpdate = 4
    this.levelFrameCount = 0
    this.levelRmsSum = 0
    this.levelPeak = 0

    this.port.onmessage = (event) => {
      if (event.data?.type === "flush") {
        this.flushAudio()
        this.flushLevel()
        this.port.postMessage({ type: "flush-complete" })
      }
    }
  }

  flushAudio() {
    if (this.audioBufferIndex === 0) return

    const chunk = this.audioBuffer.slice(0, this.audioBufferIndex)
    this.port.postMessage({
      type: "audio",
      data: chunk
    })
    this.audioBufferIndex = 0
  }

  flushLevel() {
    if (this.levelFrameCount === 0) return

    this.port.postMessage({
      type: "level",
      rms: this.levelRmsSum / this.levelFrameCount,
      peak: this.levelPeak
    })

    this.levelFrameCount = 0
    this.levelRmsSum = 0
    this.levelPeak = 0
  }

  process(inputs) {
    if (!this.isRecording) return false

    const input = inputs[0]
    if (input && input.length > 0) {
      const channelData = input[0]
      let sum = 0
      let peak = 0
      for (let i = 0; i < channelData.length; i++) {
        const sample = channelData[i]
        sum += sample * sample
        const absolute = Math.abs(sample)
        if (absolute > peak) peak = absolute
      }

      this.levelRmsSum += Math.sqrt(sum / channelData.length)
      this.levelPeak = Math.max(this.levelPeak, peak)
      this.levelFrameCount += 1

      if (this.levelFrameCount >= this.levelFramesPerUpdate) {
        this.flushLevel()
      }

      let readOffset = 0
      while (readOffset < channelData.length) {
        const remaining = this.audioBuffer.length - this.audioBufferIndex
        const copyLength = Math.min(remaining, channelData.length - readOffset)

        this.audioBuffer.set(
          channelData.subarray(readOffset, readOffset + copyLength),
          this.audioBufferIndex
        )

        this.audioBufferIndex += copyLength
        readOffset += copyLength

        if (this.audioBufferIndex >= this.audioBuffer.length) {
          this.flushAudio()
        }
      }
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
