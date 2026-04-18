import type { UIStreamChunk } from "./types"

/**
 * Parse a single line from the UI message stream.
 * The stream format is SSE with "data: " prefix followed by JSON.
 */
export function parseStreamLine(line: string): UIStreamChunk | null {
  const trimmed = line.trim()
  if (!trimmed) return null

  // Handle SSE format: strip "data: " prefix
  let jsonStr = trimmed
  if (trimmed.startsWith("data: ")) {
    jsonStr = trimmed.slice(6)
  }

  // Skip [DONE] marker
  if (jsonStr === "[DONE]") return null

  try {
    const chunk = JSON.parse(jsonStr) as Record<string, unknown>
    const type = chunk.type

    switch (type) {
      case "text-delta":
        return {
          type: "text-delta",
          delta: typeof chunk.delta === "string" ? chunk.delta : "",
        }

      case "tool-call":
        return {
          type: "tool-call",
          toolCallId:
            typeof chunk.toolCallId === "string" ? chunk.toolCallId : "",
          toolName: typeof chunk.toolName === "string" ? chunk.toolName : "",
          args: chunk.args,
        }

      // AI SDK v6 emits this for tools with needsApproval
      case "tool-approval-request":
        return {
          type: "tool-approval-request",
          approvalId:
            typeof chunk.approvalId === "string" ? chunk.approvalId : "",
          toolCallId:
            typeof chunk.toolCallId === "string" ? chunk.toolCallId : "",
          toolName: typeof chunk.toolName === "string" ? chunk.toolName : "",
          args: chunk.args,
        }

      case "tool-result":
        return {
          type: "tool-result",
          toolCallId:
            typeof chunk.toolCallId === "string" ? chunk.toolCallId : "",
          result: chunk.result,
        }

      // Handle tool execution errors
      case "tool-result-error":
        return {
          type: "tool-result-error",
          toolCallId:
            typeof chunk.toolCallId === "string" ? chunk.toolCallId : "",
          error: typeof chunk.error === "string" ? chunk.error : "Unknown error",
        }

      case "finish":
        return { type: "finish" }

      case "error":
        return {
          type: "error",
          errorText:
            typeof chunk.errorText === "string"
              ? chunk.errorText
              : "Unknown error",
        }

      // Provider-executed tools use tool-input-available instead of tool-call
      case "tool-input-available":
        return {
          type: "tool-call",
          toolCallId:
            typeof chunk.toolCallId === "string"
              ? chunk.toolCallId
              : `legacy-${Date.now()}`,
          toolName: typeof chunk.toolName === "string" ? chunk.toolName : "",
          args: chunk.input,
        }

      // Provider-executed tools use tool-output-available instead of tool-result
      case "tool-output-available":
        return {
          type: "tool-result",
          toolCallId:
            typeof chunk.toolCallId === "string" ? chunk.toolCallId : "",
          result: chunk.output,
        }

      default:
        return { type: "unknown" }
    }
  } catch {
    return null
  }
}

/**
 * Parse multiple lines from the stream buffer
 */
export function parseStreamBuffer(buffer: string): {
  chunks: UIStreamChunk[]
  remainder: string
} {
  const lines = buffer.split("\n")
  const remainder = lines.pop() ?? ""
  const chunks: UIStreamChunk[] = []

  for (const line of lines) {
    const chunk = parseStreamLine(line)
    if (chunk) {
      chunks.push(chunk)
    }
  }

  return { chunks, remainder }
}
