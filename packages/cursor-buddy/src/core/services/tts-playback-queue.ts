import { toError } from "../utils/error"

export type SpeechPlaybackTask = () => Promise<void>

interface TTSPlaybackQueueOptions {
  onError?: (error: Error) => void
  onPlaybackStart?: () => void
  signal?: AbortSignal
  prepare: (text: string, signal?: AbortSignal) => Promise<SpeechPlaybackTask>
}

/**
 * Queues sentence-level speech preparation immediately while keeping playback
 * strictly ordered.
 *
 * Preparation is allowed to run ahead of playback so server synthesis can
 * overlap with the currently playing segment, but the returned playback tasks
 * still execute one-by-one in enqueue order.
 */
export class TTSPlaybackQueue {
  private error: Error | null = null
  private hasStartedPlayback = false
  private onError?: (error: Error) => void
  private onPlaybackStart?: () => void
  private playbackChain = Promise.resolve()
  private prepare: (
    text: string,
    signal?: AbortSignal,
  ) => Promise<SpeechPlaybackTask>
  private signal?: AbortSignal

  constructor(options: TTSPlaybackQueueOptions) {
    this.onError = options.onError
    this.onPlaybackStart = options.onPlaybackStart
    this.prepare = options.prepare
    this.signal = options.signal
  }

  /**
   * Queue a speakable text segment.
   */
  enqueue(text: string): void {
    const normalizedText = text.trim()
    if (!normalizedText || this.error || this.signal?.aborted) return

    // Kick off preparation immediately so synthesis/download work can overlap
    // with the segment currently playing.
    const preparedPlaybackTask = this.prepare(normalizedText, this.signal)

    // Preparation can finish after the queue has already been aborted. Attach
    // a background rejection handler so those late failures are still recorded
    // and do not surface as unhandled promise rejections in tests or apps.
    void preparedPlaybackTask.catch((error) => {
      this.fail(toError(error))
    })

    const nextStep = this.playbackChain.then(async () => {
      if (this.signal?.aborted) return

      const play = await preparedPlaybackTask
      if (this.signal?.aborted) return

      if (!this.hasStartedPlayback) {
        this.hasStartedPlayback = true
        this.onPlaybackStart?.()
      }

      await play()
    })

    this.playbackChain = nextStep.catch((error) => {
      this.fail(toError(error))
    })
  }

  /**
   * Wait until every queued segment has either played or the queue failed.
   */
  async waitForCompletion(): Promise<void> {
    await this.playbackChain

    if (this.error) {
      throw this.error
    }
  }

  private fail(error: Error): void {
    if (this.error) return

    this.error = error
    this.onError?.(error)
  }
}
