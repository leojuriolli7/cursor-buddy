import { type Mocked, vi } from "vitest"
import type {
  AnnotatedScreenshotResult,
  AudioPlaybackPort,
  BrowserSpeechPort,
  CursorBuddyServices,
  LiveTranscriptionPort,
  PointerControllerPort,
  PointingTarget,
  ScreenCapturePort,
  VoiceCapturePort,
} from "../types"

export const defaultAnnotatedScreenshot: AnnotatedScreenshotResult = {
  imageData: "data:image/jpeg;base64,test",
  width: 1280,
  height: 720,
  viewportWidth: 1920,
  viewportHeight: 1080,
  markerMap: new Map(),
  markerContext: "No interactive elements detected.",
}

export function createJsonResponse(body: unknown, ok = true) {
  return {
    ok,
    json: vi.fn<() => Promise<unknown>>().mockResolvedValue(body),
  }
}

export function createBlobResponse(blob: Blob, ok = true) {
  return {
    ok,
    blob: vi.fn<() => Promise<Blob>>().mockResolvedValue(blob),
  }
}

export function createStreamResponse(chunks: string[], ok = true) {
  const encoder = new TextEncoder()
  let index = 0
  const read = vi
    .fn<() => Promise<ReadableStreamReadResult<Uint8Array>>>()
    .mockImplementation(async () => {
      if (index >= chunks.length) {
        return { done: true, value: undefined }
      }

      return {
        done: false,
        value: encoder.encode(chunks[index++]),
      }
    })

  return {
    ok,
    body: {
      getReader: () => ({
        read,
      }),
    },
  }
}

/**
 * Create a mock response for AI SDK UI message stream format.
 * The format is newline-delimited JSON with specific event types.
 */
export function createUIStreamResponse(
  textChunks: string[],
  toolCall?: { toolName: string; args: unknown },
  ok = true,
) {
  const lines: string[] = []

  // Add text-delta events
  for (const text of textChunks) {
    lines.push(JSON.stringify({ type: "text-delta", delta: text, id: "text-1" }))
  }

  // Add tool-input-available if provided
  if (toolCall) {
    lines.push(
      JSON.stringify({
        type: "tool-input-available",
        toolCallId: "call_1",
        toolName: toolCall.toolName,
        input: toolCall.args,
      }),
    )
  }

  // Add finish event
  lines.push(JSON.stringify({ type: "finish", finishReason: "stop" }))

  return createStreamResponse([lines.join("\n")])
}

export function createDeferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void

  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve
    reject = promiseReject
  })

  return { promise, resolve, reject }
}

export interface MockCursorBuddyServices {
  services: CursorBuddyServices
  voiceCapture: Mocked<VoiceCapturePort>
  audioPlayback: Mocked<AudioPlaybackPort>
  browserSpeech: Mocked<BrowserSpeechPort>
  liveTranscription: Mocked<LiveTranscriptionPort>
  screenCapture: Mocked<ScreenCapturePort>
  pointerController: Mocked<PointerControllerPort>
  emitLevel(level: number): void
  emitLiveTranscript(text: string): void
}

export interface MockServiceOverrides {
  voiceCapture?: Partial<Mocked<VoiceCapturePort>>
  audioPlayback?: Partial<Mocked<AudioPlaybackPort>>
  browserSpeech?: Partial<Mocked<BrowserSpeechPort>>
  liveTranscription?: Partial<Mocked<LiveTranscriptionPort>>
  screenCapture?: Partial<Mocked<ScreenCapturePort>>
  pointerController?: Partial<Mocked<PointerControllerPort>>
}

export function createMockServices(
  overrides: MockServiceOverrides = {},
): MockCursorBuddyServices {
  let levelCallback: ((level: number) => void) | null = null
  let partialTranscriptCallback: ((text: string) => void) | null = null
  const pointerListeners = new Set<() => void>()
  const pointerState = { isPointing: false }

  const voiceCapture: Mocked<VoiceCapturePort> = {
    start: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
    stop: vi
      .fn<() => Promise<Blob>>()
      .mockResolvedValue(new Blob(["audio"], { type: "audio/wav" })),
    onLevel: vi
      .fn<(callback: (level: number) => void) => void>()
      .mockImplementation((callback) => {
        levelCallback = callback
      }),
    dispose: vi.fn<() => void>(),
  }

  const audioPlayback: Mocked<AudioPlaybackPort> = {
    play: vi.fn<(blob: Blob, signal?: AbortSignal) => Promise<void>>(),
    stop: vi.fn<() => void>(),
  }
  audioPlayback.play.mockResolvedValue(undefined)

  const browserSpeech: Mocked<BrowserSpeechPort> = {
    isAvailable: vi.fn<() => boolean>().mockReturnValue(true),
    speak: vi.fn<(text: string, signal?: AbortSignal) => Promise<void>>(),
    stop: vi.fn<() => void>(),
  }
  browserSpeech.speak.mockResolvedValue(undefined)

  const liveTranscription: Mocked<LiveTranscriptionPort> = {
    isAvailable: vi.fn<() => boolean>().mockReturnValue(true),
    start: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
    stop: vi.fn<() => Promise<string>>().mockResolvedValue(""),
    onPartial: vi
      .fn<(callback: (text: string) => void) => void>()
      .mockImplementation((callback) => {
        partialTranscriptCallback = callback
      }),
    dispose: vi.fn<() => void>(),
  }

  const screenCapture: Mocked<ScreenCapturePort> = {
    capture: vi
      .fn<() => Promise<AnnotatedScreenshotResult>>()
      .mockResolvedValue(defaultAnnotatedScreenshot),
    captureAnnotated: vi
      .fn<() => Promise<AnnotatedScreenshotResult>>()
      .mockResolvedValue(defaultAnnotatedScreenshot),
  }

  const pointerController: Mocked<PointerControllerPort> = {
    pointAt: vi
      .fn<(target: PointingTarget) => void>()
      .mockImplementation(() => {
        pointerState.isPointing = true
        pointerListeners.forEach((listener) => listener())
      }),
    release: vi.fn<() => void>().mockImplementation(() => {
      pointerState.isPointing = false
      pointerListeners.forEach((listener) => listener())
    }),
    isPointing: vi
      .fn<() => boolean>()
      .mockImplementation(() => pointerState.isPointing),
    subscribe: vi
      .fn<(listener: () => void) => () => void>()
      .mockImplementation((listener) => {
        pointerListeners.add(listener)
        return () => pointerListeners.delete(listener)
      }),
    updateFollowPosition: vi.fn<() => void>(),
  }

  Object.assign(voiceCapture, overrides.voiceCapture)
  Object.assign(audioPlayback, overrides.audioPlayback)
  Object.assign(browserSpeech, overrides.browserSpeech)
  Object.assign(liveTranscription, overrides.liveTranscription)
  Object.assign(screenCapture, overrides.screenCapture)
  Object.assign(pointerController, overrides.pointerController)

  return {
    services: {
      voiceCapture,
      audioPlayback,
      browserSpeech,
      liveTranscription,
      screenCapture,
      pointerController,
    },
    voiceCapture,
    audioPlayback,
    browserSpeech,
    liveTranscription,
    screenCapture,
    pointerController,
    emitLevel(level: number) {
      levelCallback?.(level)
    },
    emitLiveTranscript(text: string) {
      partialTranscriptCallback?.(text)
    },
  }
}
