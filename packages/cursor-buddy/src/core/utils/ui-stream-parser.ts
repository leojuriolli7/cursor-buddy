import type { PointToolInput } from "../../shared/point-tool"

/**
 * Parsed chunk from AI SDK UI message stream.
 */
export type UIStreamChunk =
  | { type: "text-delta"; delta: string }
  | { type: "tool-input-available"; toolName: string; input: unknown }
  | { type: "finish" }
  | { type: "error"; errorText: string }
  | { type: "unknown" }

/**
 * Parse a single line from the UI message stream.
 * The stream format is SSE with "data: " prefix followed by JSON.
 */
export function parseUIStreamLine(line: string): UIStreamChunk | null {
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
    const chunk = JSON.parse(jsonStr) as {
      type: string
      delta?: string
      toolName?: string
      input?: unknown
      errorText?: string
    }

    switch (chunk.type) {
      case "text-delta":
        return { type: "text-delta", delta: chunk.delta ?? "" }

      case "tool-input-available":
        return {
          type: "tool-input-available",
          toolName: chunk.toolName ?? "",
          input: chunk.input,
        }

      case "finish":
        return { type: "finish" }

      case "error":
        return { type: "error", errorText: chunk.errorText ?? "Unknown error" }

      default:
        return { type: "unknown" }
    }
  } catch {
    return null
  }
}

/**
 * Check if a tool call is a point tool call with valid input.
 */
export function isPointToolCall(
  chunk: UIStreamChunk,
): chunk is {
  type: "tool-input-available"
  toolName: "point"
  input: PointToolInput
} {
  return (
    chunk.type === "tool-input-available" &&
    chunk.toolName === "point" &&
    chunk.input != null &&
    typeof chunk.input === "object" &&
    "type" in chunk.input &&
    "label" in chunk.input
  )
}
