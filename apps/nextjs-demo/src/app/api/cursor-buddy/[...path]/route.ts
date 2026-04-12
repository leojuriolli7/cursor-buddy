import { toNextJsHandler } from "cursor-buddy/server/next";
import { cursorBuddy } from "@/lib/cursor-buddy";

export const { GET, POST } = toNextJsHandler(cursorBuddy);
