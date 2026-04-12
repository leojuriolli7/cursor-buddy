/**
 * Audio conversion utilities for voice capture.
 * Converts Float32 audio data to WAV format for server transcription.
 */

/**
 * Merge multiple Float32Array chunks into a single array
 */
export function mergeAudioChunks(chunks: Float32Array[]): Float32Array {
  const totalLength = chunks.reduce((acc, chunk) => acc + chunk.length, 0)
  const result = new Float32Array(totalLength)

  let offset = 0
  for (const chunk of chunks) {
    result.set(chunk, offset)
    offset += chunk.length
  }

  return result
}

/**
 * Convert Float32 audio data to 16-bit PCM
 */
function floatTo16BitPCM(
  output: DataView,
  offset: number,
  input: Float32Array
): void {
  for (let i = 0; i < input.length; i++, offset += 2) {
    const sample = Math.max(-1, Math.min(1, input[i]))
    output.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true)
  }
}

/**
 * Write a string to a DataView
 */
function writeString(view: DataView, offset: number, string: string): void {
  for (let i = 0; i < string.length; i++) {
    view.setUint8(offset + i, string.charCodeAt(i))
  }
}

/**
 * Encode Float32 audio data as a WAV file
 */
export function encodeWAV(samples: Float32Array, sampleRate: number): Blob {
  const numChannels = 1
  const bitsPerSample = 16
  const bytesPerSample = bitsPerSample / 8
  const blockAlign = numChannels * bytesPerSample

  const dataLength = samples.length * bytesPerSample
  const buffer = new ArrayBuffer(44 + dataLength)
  const view = new DataView(buffer)

  // RIFF header
  writeString(view, 0, "RIFF")
  view.setUint32(4, 36 + dataLength, true)
  writeString(view, 8, "WAVE")

  // fmt chunk
  writeString(view, 12, "fmt ")
  view.setUint32(16, 16, true) // chunk size
  view.setUint16(20, 1, true) // audio format (PCM)
  view.setUint16(22, numChannels, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * blockAlign, true) // byte rate
  view.setUint16(32, blockAlign, true)
  view.setUint16(34, bitsPerSample, true)

  // data chunk
  writeString(view, 36, "data")
  view.setUint32(40, dataLength, true)

  floatTo16BitPCM(view, 44, samples)

  return new Blob([buffer], { type: "audio/wav" })
}
