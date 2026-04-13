import { streamText } from "ai"
import { DEFAULT_SYSTEM_PROMPT } from "../system-prompt"
import type { ChatRequestBody, CursorBuddyHandlerConfig } from "../types"

/**
 * Handle chat requests: screenshot + transcript → AI SSE stream
 */
export async function handleChat(
  request: Request,
  config: CursorBuddyHandlerConfig,
): Promise<Response> {
  const body = (await request.json()) as ChatRequestBody
  const { screenshot, transcript, history, capture, markerContext } = body

  // Resolve system prompt (string or function)
  const systemPrompt =
    typeof config.system === "function"
      ? config.system({ defaultPrompt: DEFAULT_SYSTEM_PROMPT })
      : (config.system ?? DEFAULT_SYSTEM_PROMPT)

  // Trim history to maxHistory (default 10 exchanges = 20 messages)
  const maxMessages = (config.maxHistory ?? 10) * 2
  const trimmedHistory = history.slice(-maxMessages)

  // Build capture context with marker information
  const captureContextParts: string[] = []

  if (capture) {
    captureContextParts.push(
      `Screenshot size: ${capture.width}x${capture.height} pixels.`,
    )
  }

  if (markerContext) {
    captureContextParts.push("", markerContext)
  }

  const captureContext =
    captureContextParts.length > 0 ? captureContextParts.join("\n") : null

  // Build messages array with vision content
  const messages = [
    ...trimmedHistory.map((msg) => ({
      role: msg.role as "user" | "assistant",
      content: msg.content,
    })),
    {
      role: "user" as const,
      content: [
        ...(captureContext
          ? [
              {
                type: "text" as const,
                text: captureContext,
              },
            ]
          : []),
        {
          type: "image" as const,
          image: screenshot,
        },
        {
          type: "text" as const,
          text: transcript,
        },
      ],
    },
  ]

  const result = streamText({
    model: config.model,
    system: systemPrompt,
    messages,
    tools: config.tools,
  })

  return result.toTextStreamResponse()
}
