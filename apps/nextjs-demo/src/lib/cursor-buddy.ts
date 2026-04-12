import { createCursorBuddyHandler } from "cursor-buddy/server";
import { openai } from "@ai-sdk/openai";

export const cursorBuddy = createCursorBuddyHandler({
  model: openai("gpt-5-mini"),
  speechModel: openai.speech("gpt-4o-mini-tts-2025-12-15"),
  transcriptionModel: openai.transcription("whisper-1"),
});
