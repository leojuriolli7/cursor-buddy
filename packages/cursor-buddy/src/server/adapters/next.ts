import type { CursorBuddyHandler } from "../types"

/**
 * Convert a CursorBuddyHandler to Next.js App Router route handlers.
 *
 * @example
 * ```ts
 * // app/api/cursor-buddy/[...path]/route.ts
 * import { toNextJsHandler } from "cursor-buddy/server/next"
 * import { cursorBuddy } from "@/lib/cursor-buddy"
 *
 * export const { POST } = toNextJsHandler(cursorBuddy)
 * ```
 */
export function toNextJsHandler(cursorBuddy: CursorBuddyHandler) {
  const handler = (request: Request) => cursorBuddy.handler(request)

  return {
    POST: handler,
  }
}
