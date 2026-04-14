import type { BrowserSpeechPort } from "../types"
import { toError } from "../utils/error"
import {
  normalizeSpeechText,
  resolveBrowserLanguage,
} from "../utils/web-speech"

function getSpeechSynthesis(): SpeechSynthesis | undefined {
  return typeof globalThis.speechSynthesis === "undefined"
    ? undefined
    : globalThis.speechSynthesis
}

function getSpeechSynthesisUtterance():
  | typeof SpeechSynthesisUtterance
  | undefined {
  return typeof globalThis.SpeechSynthesisUtterance === "undefined"
    ? undefined
    : globalThis.SpeechSynthesisUtterance
}

function toSpeechError(event?: SpeechSynthesisErrorEvent): Error {
  const errorCode = event?.error

  return new Error(
    errorCode ? `Browser speech failed: ${errorCode}` : "Browser speech failed",
  )
}

/**
 * Browser-backed speech synthesis using the Web Speech API.
 */
export class BrowserSpeechService implements BrowserSpeechPort {
  private removeAbortListener: (() => void) | null = null
  private settleSpeech:
    | ((outcome: "resolve" | "reject", error?: Error) => void)
    | null = null
  private utterance: SpeechSynthesisUtterance | null = null

  /**
   * Report whether this runtime exposes the browser Web Speech synthesis APIs.
   */
  isAvailable(): boolean {
    return Boolean(getSpeechSynthesis() && getSpeechSynthesisUtterance())
  }

  /**
   * Speak a single text segment in the browser.
   *
   * Each queue item owns its own utterance. We only stop an existing utterance
   * when this service still has one in flight, so streamed playback does not
   * spam global `speechSynthesis.cancel()` between already-completed segments.
   */
  async speak(text: string, signal?: AbortSignal): Promise<void> {
    const speechSynthesis = getSpeechSynthesis()
    const SpeechSynthesisUtteranceCtor = getSpeechSynthesisUtterance()

    if (!speechSynthesis || !SpeechSynthesisUtteranceCtor) {
      throw new Error("Browser speech is not supported")
    }

    if (this.hasActiveSpeech()) {
      this.stop()
    }

    const normalizedText = normalizeSpeechText(text)
    if (!normalizedText || signal?.aborted) return

    const utterance = new SpeechSynthesisUtteranceCtor(normalizedText)
    utterance.lang = resolveBrowserLanguage()
    this.utterance = utterance

    return new Promise<void>((resolve, reject) => {
      let settled = false

      const settle = (outcome: "resolve" | "reject", error?: Error) => {
        if (settled) return
        settled = true

        if (this.settleSpeech === settle) {
          this.settleSpeech = null
        }

        this.removeAbortListener?.()
        this.removeAbortListener = null
        this.clearUtterance(utterance)

        if (outcome === "resolve") {
          resolve()
          return
        }

        reject(error ?? new Error("Browser speech failed"))
      }

      this.settleSpeech = settle

      const abortHandler = () => {
        try {
          speechSynthesis.cancel()
        } catch {
          // Ignore cancel failures during abort cleanup.
        }

        settle("resolve")
      }

      if (signal) {
        signal.addEventListener("abort", abortHandler, { once: true })
        this.removeAbortListener = () => {
          signal.removeEventListener("abort", abortHandler)
        }
      }

      utterance.onend = () => {
        settle("resolve")
      }

      utterance.onerror = (event) => {
        if (signal?.aborted) {
          settle("resolve")
          return
        }

        settle("reject", toSpeechError(event))
      }

      try {
        speechSynthesis.speak(utterance)
      } catch (error) {
        settle("reject", toError(error, "Browser speech failed to start"))
      }
    })
  }

  /**
   * Stop the current utterance owned by this service, if one is active.
   *
   * We intentionally do nothing when the service is idle so we do not cancel
   * unrelated speech synthesis work that host apps may be doing elsewhere.
   */
  stop(): void {
    if (!this.hasActiveSpeech()) {
      return
    }

    const speechSynthesis = getSpeechSynthesis()

    if (speechSynthesis) {
      try {
        speechSynthesis.cancel()
      } catch {
        // Ignore cancel failures during cleanup.
      }
    }

    if (this.settleSpeech) {
      const settleSpeech = this.settleSpeech
      this.settleSpeech = null
      settleSpeech("resolve")
      return
    }

    this.removeAbortListener?.()
    this.removeAbortListener = null
    this.clearUtterance(this.utterance)
  }

  private hasActiveSpeech(): boolean {
    return Boolean(this.utterance || this.settleSpeech)
  }

  private clearUtterance(utterance: SpeechSynthesisUtterance | null): void {
    if (!utterance) return

    utterance.onend = null
    utterance.onerror = null

    if (this.utterance === utterance) {
      this.utterance = null
    }
  }
}
