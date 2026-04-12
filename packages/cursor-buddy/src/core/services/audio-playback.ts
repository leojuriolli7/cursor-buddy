/**
 * Framework-agnostic service for audio playback with abort support.
 */
export class AudioPlaybackService {
  private audio: HTMLAudioElement | null = null
  private currentUrl: string | null = null
  private settlePlayback:
    | ((outcome: "resolve" | "reject", error?: Error) => void)
    | null = null
  private removeAbortListener: (() => void) | null = null

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

    return new Promise<void>((resolve, reject) => {
      if (!this.audio) {
        this.cleanup()
        resolve()
        return
      }

      let settled = false
      const audio = this.audio

      const settle = (outcome: "resolve" | "reject", error?: Error) => {
        if (settled) return
        settled = true

        if (this.settlePlayback === settle) {
          this.settlePlayback = null
        }

        this.removeAbortListener?.()
        this.removeAbortListener = null

        if (this.audio === audio) {
          this.audio.onended = null
          this.audio.onerror = null
          this.audio = null
        }

        this.cleanup()

        if (outcome === "resolve") {
          resolve()
          return
        }

        reject(error ?? new Error("Audio playback failed"))
      }

      this.settlePlayback = settle

      const abortHandler = () => {
        audio.pause()
        settle("resolve")
      }

      if (signal) {
        signal.addEventListener("abort", abortHandler, { once: true })
        this.removeAbortListener = () => {
          signal.removeEventListener("abort", abortHandler)
        }
      }

      this.audio.onended = () => {
        settle("resolve")
      }

      this.audio.onerror = () => {
        settle("reject", new Error("Audio playback failed"))
      }

      this.audio.play().catch((err) => {
        settle("reject", err instanceof Error ? err : new Error(String(err)))
      })
    })
  }

  /**
   * Stop any currently playing audio.
   */
  stop(): void {
    if (this.audio) {
      this.audio.pause()
    }

    if (this.settlePlayback) {
      const settlePlayback = this.settlePlayback
      this.settlePlayback = null
      settlePlayback("resolve")
      return
    }

    this.removeAbortListener?.()
    this.removeAbortListener = null

    if (this.audio) {
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
