import { toNextJsHandler } from "cursor-buddy/server/next"
import { cursorBuddy } from "@/lib/cursor-buddy"

const { GET: handleGet, POST: handlePost } = toNextJsHandler(cursorBuddy)

const forbidden = () => new Response("Forbidden", { status: 403 })

const isSameOrigin = (req: Request) => {
  const origin = req.headers.get("origin")

  if (!origin) return true

  return new URL(origin).host === req.headers.get("host")
}

export const GET = (req: Request) =>
  isSameOrigin(req) ? handleGet(req) : forbidden()

export const POST = (req: Request) =>
  isSameOrigin(req) ? handlePost(req) : forbidden()
