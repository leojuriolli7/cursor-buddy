/**
 * Framework-agnostic service for audio playback with abort support.
 */
export class AudioPlaybackService {
  private audio: HTMLAudioElement | null = null
  private currentUrl: string | null = null

  /**
   * Play audio from a blob. Stops any currently playing audio first.
   * @param blob - Audio blob to play
   * @param signal - Optional AbortSignal to cancel playback
   * @returns Promise that resolves when playback completes
   */
  async play(blob: Blob, signal?: AbortSignal): Promise<void> {
    // Stop any current playback
    this.stop()

    // Check if already aborted
    if (signal?.aborted) return

    const url = URL.createObjectURL(blob)
    this.currentUrl = url
    this.audio = new Audio(url)

    // Set up abort handler
    const abortHandler = () => this.stop()
    signal?.addEventListener("abort", abortHandler)

    return new Promise<void>((resolve, reject) => {
      if (!this.audio) {
        this.cleanup()
        resolve()
        return
      }

      this.audio.onended = () => {
        signal?.removeEventListener("abort", abortHandler)
        this.cleanup()
        resolve()
      }

      this.audio.onerror = () => {
        signal?.removeEventListener("abort", abortHandler)
        this.cleanup()
        reject(new Error("Audio playback failed"))
      }

      this.audio.play().catch((err) => {
        signal?.removeEventListener("abort", abortHandler)
        this.cleanup()
        reject(err)
      })
    })
  }

  /**
   * Stop any currently playing audio.
   */
  stop(): void {
    if (this.audio) {
      this.audio.pause()
      this.audio.onended = null
      this.audio.onerror = null
      this.audio = null
    }
    this.cleanup()
  }

  private cleanup(): void {
    if (this.currentUrl) {
      URL.revokeObjectURL(this.currentUrl)
      this.currentUrl = null
    }
  }
}
