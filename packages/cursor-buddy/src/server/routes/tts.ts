import { experimental_generateSpeech as generateSpeech } from "ai"
import type { CursorBuddyHandlerConfig, TTSRequestBody } from "../types"

/**
 * Handle TTS requests: text → audio
 */
export async function handleTTS(
  request: Request,
  config: CursorBuddyHandlerConfig,
): Promise<Response> {
  const body = (await request.json()) as TTSRequestBody
  const { text } = body

  if (!text) {
    return new Response(JSON.stringify({ error: "No text provided" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    })
  }

  const result = await generateSpeech({
    model: config.speechModel,
    text,
  })

  // Create a new ArrayBuffer copy to satisfy TypeScript's strict typing
  const audioData = new Uint8Array(result.audio.uint8Array)

  return new Response(audioData, {
    headers: {
      "Content-Type": "audio/mpeg",
    },
  })
}
