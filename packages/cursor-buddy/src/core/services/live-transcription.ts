import type { LiveTranscriptionPort } from "../types"
import { toError } from "../utils/error"
import {
  normalizeSpeechText,
  resolveBrowserLanguage,
} from "../utils/web-speech"

interface SpeechRecognitionAlternativeLike {
  transcript: string
}

interface SpeechRecognitionResultLike {
  isFinal: boolean
  length: number
  [index: number]: SpeechRecognitionAlternativeLike
}

interface SpeechRecognitionResultListLike {
  length: number
  [index: number]: SpeechRecognitionResultLike
}

interface SpeechRecognitionEventLike {
  results: SpeechRecognitionResultListLike
}

interface SpeechRecognitionErrorEventLike {
  error?: string
  message?: string
}

interface SpeechRecognitionLike {
  continuous: boolean
  interimResults: boolean
  lang: string
  maxAlternatives: number
  onend: (() => void) | null
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null
  onresult: ((event: SpeechRecognitionEventLike) => void) | null
  onstart: (() => void) | null
  abort(): void
  start(): void
  stop(): void
}

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike

type GlobalWithSpeechRecognition = typeof globalThis & {
  SpeechRecognition?: SpeechRecognitionConstructor
  webkitSpeechRecognition?: SpeechRecognitionConstructor
}

function getSpeechRecognitionConstructor():
  | SpeechRecognitionConstructor
  | undefined {
  const globalScope = globalThis as GlobalWithSpeechRecognition

  return globalScope.SpeechRecognition ?? globalScope.webkitSpeechRecognition
}

function toRecognitionError(event?: SpeechRecognitionErrorEventLike): Error {
  const errorCode = event?.error
  const message =
    event?.message ||
    (errorCode
      ? `Browser transcription failed: ${errorCode}`
      : "Browser transcription failed")

  return new Error(message)
}

function buildTranscripts(results: SpeechRecognitionResultListLike): {
  finalTranscript: string
  liveTranscript: string
} {
  let finalTranscript = ""
  let interimTranscript = ""

  // Web Speech returns the running recognition result list on every event.
  // We rebuild both views each time so the client always sees the freshest
  // "confirmed + in-progress" transcript.
  for (let index = 0; index < results.length; index += 1) {
    const result = results[index]
    const alternative = result?.[0]
    const transcript = alternative?.transcript ?? ""

    if (!transcript) continue

    if (result.isFinal) {
      finalTranscript += `${transcript} `
    } else {
      interimTranscript += `${transcript} `
    }
  }

  const normalizedFinal = normalizeSpeechText(finalTranscript)
  const normalizedInterim = normalizeSpeechText(interimTranscript)

  return {
    finalTranscript: normalizedFinal,
    liveTranscript: normalizeSpeechText(
      [normalizedFinal, normalizedInterim].filter(Boolean).join(" "),
    ),
  }
}

/**
 * Browser-backed live transcription using the Web Speech API.
 */
export class LiveTranscriptionService implements LiveTranscriptionPort {
  private finalTranscript = ""
  private hasStarted = false
  private hasEnded = false
  private lastError: Error | null = null
  private partialCallback: ((text: string) => void) | null = null
  private recognition: SpeechRecognitionLike | null = null
  private startReject: ((reason?: unknown) => void) | null = null
  private startResolve: (() => void) | null = null
  private stopReject: ((reason?: unknown) => void) | null = null
  private stopResolve: ((value: string) => void) | null = null

  isAvailable(): boolean {
    return Boolean(getSpeechRecognitionConstructor())
  }

  /**
   * Register a callback for the latest browser transcript while the user is
   * still speaking.
   */
  onPartial(callback: (text: string) => void): void {
    this.partialCallback = callback
  }

  /**
   * Start a new Web Speech recognition session.
   */
  async start(): Promise<void> {
    const SpeechRecognitionCtor = getSpeechRecognitionConstructor()
    if (!SpeechRecognitionCtor) {
      throw new Error("Browser transcription is not supported")
    }

    // Each push-to-talk turn owns a fresh recognition session. We clear any
    // previous session first so late events do not leak into the next turn.
    this.dispose()

    const recognition = new SpeechRecognitionCtor()
    this.recognition = recognition
    recognition.continuous = true
    recognition.interimResults = true
    recognition.maxAlternatives = 1
    recognition.lang = resolveBrowserLanguage()
    recognition.onstart = () => {
      this.hasStarted = true
      this.startResolve?.()
      this.startResolve = null
      this.startReject = null
    }
    recognition.onresult = (event) => {
      const transcripts = buildTranscripts(event.results)
      this.finalTranscript = transcripts.finalTranscript
      this.partialCallback?.(transcripts.liveTranscript)
    }
    recognition.onerror = (event) => {
      this.lastError = toRecognitionError(event)

      // Errors before `onstart` should reject startup immediately. Errors after
      // startup are handled when the session ends or when stop() awaits it.
      if (!this.hasStarted) {
        this.startReject?.(this.lastError)
        this.startResolve = null
        this.startReject = null
      }
    }
    recognition.onend = () => {
      this.hasEnded = true

      // Some browsers can jump straight to `end` when recognition is blocked
      // or cancelled before startup. Convert that into a startup failure.
      if (!this.hasStarted) {
        const error =
          this.lastError ??
          new Error("Browser transcription ended before it could start")

        this.startReject?.(error)
        this.startResolve = null
        this.startReject = null
      }

      // Once stop() is waiting, settle it on the terminal `end` event so we
      // capture the last finalized transcript from the browser.
      if (this.stopResolve || this.stopReject) {
        if (this.lastError) {
          this.stopReject?.(this.lastError)
        } else {
          this.stopResolve?.(normalizeSpeechText(this.finalTranscript))
        }

        this.stopResolve = null
        this.stopReject = null
      }
    }

    const started = new Promise<void>((resolve, reject) => {
      this.startResolve = resolve
      this.startReject = reject
    })

    try {
      recognition.start()
    } catch (error) {
      this.clearRecognition()
      throw toError(error, "Browser transcription failed to start")
    }

    try {
      await started
    } catch (error) {
      this.clearRecognition()
      throw toError(error, "Browser transcription failed to start")
    }
  }

  /**
   * Stop the current recognition session and resolve with the final transcript.
   */
  async stop(): Promise<string> {
    if (!this.recognition) {
      if (this.lastError) {
        throw this.lastError
      }

      return normalizeSpeechText(this.finalTranscript)
    }

    if (this.hasEnded) {
      const transcript = normalizeSpeechText(this.finalTranscript)
      const error = this.lastError
      this.clearRecognition()

      if (error) {
        throw error
      }

      return transcript
    }

    const recognition = this.recognition

    const transcript = await new Promise<string>((resolve, reject) => {
      this.stopResolve = resolve
      this.stopReject = reject

      try {
        recognition.stop()
      } catch (error) {
        reject(toError(error, "Browser transcription failed to stop"))
      }
    }).finally(() => {
      this.clearRecognition()
    })

    return normalizeSpeechText(transcript)
  }

  /**
   * Abort the current recognition session and reset the service for reuse.
   */
  dispose(): void {
    if (this.recognition) {
      try {
        this.recognition.abort()
      } catch {
        // Ignore abort failures during cleanup.
      }
    }

    this.startReject?.(new Error("Browser transcription aborted"))
    this.stopResolve?.(normalizeSpeechText(this.finalTranscript))
    this.startResolve = null
    this.startReject = null
    this.stopResolve = null
    this.stopReject = null
    this.clearRecognition()
    this.resetSessionState()
  }

  private clearRecognition(): void {
    if (!this.recognition) return

    // Drop event handlers explicitly so a late browser callback cannot mutate
    // the service after the turn has already moved on.
    this.recognition.onstart = null
    this.recognition.onresult = null
    this.recognition.onerror = null
    this.recognition.onend = null
    this.recognition = null
  }

  private resetSessionState(): void {
    this.finalTranscript = ""
    this.hasStarted = false
    this.hasEnded = false
    this.lastError = null
    // Clear the live transcript view at the start and end of each turn.
    this.partialCallback?.("")
  }
}
