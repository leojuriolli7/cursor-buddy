import { type StopCondition, stepCountIs, streamText } from "ai"
import { pointTool } from "../../shared/point-tool"
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
  const { screenshot, transcript, history, capture, domSnapshot } = body

  // Resolve system prompt (string or function)
  const systemPrompt =
    typeof config.system === "function"
      ? config.system({ defaultPrompt: DEFAULT_SYSTEM_PROMPT })
      : (config.system ?? DEFAULT_SYSTEM_PROMPT)

  // Trim history to maxHistory (default 10 exchanges = 20 messages)
  const maxMessages = (config.maxHistory ?? 10) * 2
  const trimmedHistory = history.slice(-maxMessages)

  // Build capture context with DOM snapshot
  const captureContextParts: string[] = []

  if (capture) {
    captureContextParts.push(
      `Screenshot size: ${capture.width}x${capture.height} pixels.`,
    )
  }

  if (domSnapshot) {
    captureContextParts.push(
      "",
      "Visible page structure (each element has @X ID for pointing):",
      domSnapshot,
    )
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
        { type: "image" as const, image: screenshot },
        { type: "text" as const, text: transcript },
      ],
    },
  ]

  const tools = {
    point: pointTool,
    ...config.tools,
  }

  const mustContinueUntilText: StopCondition<typeof tools> = ({ steps }) => {
    const lastStep = steps.at(-1)
    if (!lastStep) return false

    const stepText =
      typeof lastStep.text === "string" ? lastStep.text.trim() : ""
    const hadToolResults =
      Array.isArray(lastStep.toolResults) && lastStep.toolResults.length > 0

    // Stop only after we have actual assistant text.
    // If the step was tool-only, continue the loop.
    if (stepText.length > 0) return true
    if (hadToolResults) return false

    return false
  }

  const result = streamText({
    model: config.model,
    system: systemPrompt,
    providerOptions: config?.modelProviderMetadata,
    messages,
    tools,

    // Allow a follow-up step after tool use instead of the default single step.
    stopWhen: [mustContinueUntilText, stepCountIs(3)],

    prepareStep: async ({ stepNumber, steps }) => {
      // Normal first pass: let the model speak and optionally point.
      if (stepNumber === 0) {
        return {}
      }

      const previousStep = steps.at(-1)

      const prevText =
        typeof previousStep?.text === "string" ? previousStep.text.trim() : ""

      const usedPoint =
        previousStep?.toolCalls?.some((call) => call.toolName === "point") ??
        false

      // If the previous step pointed but did not speak, force the next step
      // to be text-only by removing the point tool.
      if (usedPoint && prevText.length === 0) {
        const toolNames = Object.keys(tools) as Array<keyof typeof tools>

        return {
          activeTools: toolNames.filter((name) => name !== "point"),
        }
      }

      return {}
    },
  })

  return result.toUIMessageStreamResponse()
}
