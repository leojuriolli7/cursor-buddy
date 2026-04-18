import type { ModelMessage } from "ai"
import { type StopCondition, stepCountIs, streamText } from "ai"
import { pointTool } from "../../core/tools/point-tool"
import { DEFAULT_SYSTEM_PROMPT } from "../system-prompt"
import type {
  ChatRequestBody,
  ConversationMessage,
  CursorBuddyHandlerConfig,
  ToolApprovalResponseContent,
} from "../types"

/**
 * Build the visual context string from capture metadata and DOM snapshot.
 */
function buildCaptureContext(
  capture: ChatRequestBody["capture"],
  domSnapshot: string | undefined,
): string | null {
  const parts: string[] = []

  if (capture) {
    parts.push(`Screenshot size: ${capture.width}x${capture.height} pixels.`)
  }

  if (domSnapshot) {
    parts.push(
      "",
      "Visible page structure (each element has @X ID for pointing):",
      domSnapshot,
    )
  }

  return parts.length > 0 ? parts.join("\n") : null
}

/**
 * Check if a message is a tool approval response.
 */
function isToolApprovalContent(
  content: ConversationMessage["content"],
): content is ToolApprovalResponseContent[] {
  return (
    Array.isArray(content) &&
    content.length > 0 &&
    content[0].type === "tool-approval-response"
  )
}

/**
 * Convert client messages to AI SDK CoreMessage format.
 * Attaches screenshot and DOM snapshot to the appropriate message.
 */
function buildAIMessages(
  clientMessages: ConversationMessage[],
  screenshot: string | undefined,
  capture: ChatRequestBody["capture"],
  domSnapshot: string | undefined,
  maxHistory: number,
): ModelMessage[] {
  // Trim to max history (default 10 exchanges = 20 messages)
  const maxMessages = maxHistory * 2
  const trimmedMessages = clientMessages.slice(-maxMessages)

  const aiMessages: ModelMessage[] = []
  const captureContext = buildCaptureContext(capture, domSnapshot)

  // Find the last user message that should have visual context attached
  // This is the last "user" role message with string content (not a tool response)
  let lastUserMessageIndex = -1
  for (let i = trimmedMessages.length - 1; i >= 0; i--) {
    const msg = trimmedMessages[i]
    if (msg.role === "user" && typeof msg.content === "string") {
      lastUserMessageIndex = i
      break
    }
  }

  for (let i = 0; i < trimmedMessages.length; i++) {
    const msg = trimmedMessages[i]

    if (msg.role === "user") {
      if (typeof msg.content === "string") {
        // Check if this is the message that should have visual context
        const shouldAttachVisuals =
          i === lastUserMessageIndex && screenshot !== undefined

        if (shouldAttachVisuals) {
          // Build multimodal content with screenshot
          const contentParts: Array<
            { type: "text"; text: string } | { type: "image"; image: string }
          > = []

          if (captureContext) {
            contentParts.push({ type: "text", text: captureContext })
          }

          contentParts.push({ type: "image", image: screenshot })
          contentParts.push({ type: "text", text: msg.content })

          aiMessages.push({
            role: "user",
            content: contentParts,
          })
        } else {
          // Plain text message
          aiMessages.push({
            role: "user",
            content: msg.content,
          })
        }
      }
      // Skip user messages with non-string content (shouldn't happen in normal flow)
    } else if (msg.role === "assistant") {
      aiMessages.push({
        role: "assistant",
        content: typeof msg.content === "string" ? msg.content : "",
      })
    } else if (msg.role === "tool" && isToolApprovalContent(msg.content)) {
      // Convert tool approval responses to AI SDK format
      // ToolApprovalResponse goes directly in the content array
      aiMessages.push({
        role: "tool",
        content: msg.content.map((approval) => ({
          type: "tool-approval-response" as const,
          approvalId: approval.approvalId,
          approved: approval.approved,
        })),
      })
    }
  }

  return aiMessages
}

/**
 * Handle chat requests: messages + screenshot → AI SSE stream
 */
export async function handleChat(
  request: Request,
  config: CursorBuddyHandlerConfig,
): Promise<Response> {
  const body = (await request.json()) as ChatRequestBody
  const { messages: clientMessages, screenshot, capture, domSnapshot } = body

  // Resolve system prompt (string or function)
  const systemPrompt =
    typeof config.system === "function"
      ? config.system({ defaultPrompt: DEFAULT_SYSTEM_PROMPT })
      : (config.system ?? DEFAULT_SYSTEM_PROMPT)

  // Build AI SDK messages from client messages
  const messages = buildAIMessages(
    clientMessages,
    screenshot,
    capture,
    domSnapshot,
    config.maxHistory ?? 10,
  )

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
