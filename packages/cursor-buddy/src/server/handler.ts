import { handleChat } from "./routes/chat"
import { handleTranscribe } from "./routes/transcribe"
import { handleTTS } from "./routes/tts"
import type { CursorBuddyHandler, CursorBuddyHandlerConfig } from "./types"

/**
 * Create a cursor buddy request handler.
 *
 * The handler responds to three routes based on the last path segment:
 * - /chat - Screenshot + transcript → AI SSE stream
 * - /transcribe - Audio → text
 * - /tts - Text → audio
 *
 * @example
 * ```ts
 * import { createCursorBuddyHandler } from "cursor-buddy/server"
 * import { openai } from "@ai-sdk/openai"
 *
 * const cursorBuddy = createCursorBuddyHandler({
 *   model: openai("gpt-4o"),
 *   speechModel: openai.speech("tts-1"), // optional for browser-only speech
 *   transcriptionModel: openai.transcription("whisper-1"),
 * })
 * ```
 */
export function createCursorBuddyHandler(
  config: CursorBuddyHandlerConfig,
): CursorBuddyHandler {
  const handler = async (request: Request): Promise<Response> => {
    const url = new URL(request.url)
    const pathSegments = url.pathname.split("/").filter(Boolean)
    const route = pathSegments[pathSegments.length - 1]

    switch (route) {
      case "chat":
        return handleChat(request, config)

      case "transcribe":
        return handleTranscribe(request, config)

      case "tts":
        return handleTTS(request, config)

      default:
        return new Response(
          JSON.stringify({
            error: "Not found",
            availableRoutes: ["/chat", "/transcribe", "/tts"],
          }),
          {
            status: 404,
            headers: { "Content-Type": "application/json" },
          },
        )
    }
  }

  return { handler, config }
}
