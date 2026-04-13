import { experimental_transcribe as transcribe } from "ai"
import type { CursorBuddyHandlerConfig, TranscribeResponse } from "../types"

/**
 * Handle transcription requests: audio file → text
 */
export async function handleTranscribe(
  request: Request,
  config: CursorBuddyHandlerConfig,
): Promise<Response> {
  const formData = await request.formData()
  const audioFile = formData.get("audio")

  if (!audioFile || !(audioFile instanceof File)) {
    return new Response(JSON.stringify({ error: "No audio file provided" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    })
  }

  const audioBuffer = await audioFile.arrayBuffer()

  const result = await transcribe({
    model: config.transcriptionModel,
    audio: new Uint8Array(audioBuffer),
  })

  const response: TranscribeResponse = { text: result.text }

  return new Response(JSON.stringify(response), {
    headers: { "Content-Type": "application/json" },
  })
}
