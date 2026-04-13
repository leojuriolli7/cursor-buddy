import { openai } from "@ai-sdk/openai"
import { createCursorBuddyHandler } from "cursor-buddy/server"

export const cursorBuddy = createCursorBuddyHandler({
  model: openai("gpt-5-mini"),
  speechModel: openai.speech("gpt-4o-mini-tts"),
  transcriptionModel: openai.transcription("gpt-4o-mini-transcribe"),
})
