import { createCursorBuddyHandler } from "cursor-buddy/server";
import { openai } from "@ai-sdk/openai";

export const cursorBuddy = createCursorBuddyHandler({
  model: openai("gpt-4o"),
  speechModel: openai.speech("tts-1"),
  transcriptionModel: openai.transcription("whisper-1"),
});
