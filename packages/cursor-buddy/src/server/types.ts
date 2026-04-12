import type { LanguageModel, SpeechModel, TranscriptionModel, Tool } from "ai"

/**
 * Configuration for createCursorBuddyHandler
 */
export interface CursorBuddyHandlerConfig {
  /** AI SDK language model for chat (e.g., openai("gpt-4o")) */
  model: LanguageModel

  /** AI SDK speech model for TTS (e.g., openai.speech("tts-1")) */
  speechModel: SpeechModel

  /** AI SDK transcription model (e.g., openai.transcription("whisper-1")) */
  transcriptionModel: TranscriptionModel

  /**
   * System prompt for the AI. Can be a string or a function that receives
   * the default prompt and returns a modified version.
   */
  system?: string | ((ctx: { defaultPrompt: string }) => string)

  /** AI SDK tools available to the model */
  tools?: Record<string, Tool>

  /** Maximum conversation history messages to include (default: 10) */
  maxHistory?: number
}

/**
 * Return type of createCursorBuddyHandler
 */
export interface CursorBuddyHandler {
  /** The main request handler */
  handler: (request: Request) => Promise<Response>

  /** The resolved configuration */
  config: CursorBuddyHandlerConfig
}

/**
 * Chat request body
 */
export interface ChatRequestBody {
  /** Base64-encoded screenshot of the viewport */
  screenshot: string

  /** Transcribed user speech */
  transcript: string

  /** Previous conversation messages */
  history: Array<{ role: "user" | "assistant"; content: string }>
}

/**
 * TTS request body
 */
export interface TTSRequestBody {
  /** Text to convert to speech */
  text: string
}

/**
 * Transcription response
 */
export interface TranscribeResponse {
  /** Transcribed text */
  text: string
}
