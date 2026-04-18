import type { ToolCallStatus, ToolDisplayConfig } from "./types"

/**
 * Capitalize the first letter of a string.
 */
function capitalize(str: string): string {
  if (!str) return str
  return str.charAt(0).toUpperCase() + str.slice(1)
}

/**
 * Convert a tool name to human-readable format.
 * e.g., "web_search" -> "web search", "createNote" -> "create note"
 */
function humanizeToolName(toolName: string): string {
  return toolName
    .replace(/_/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .toLowerCase()
}

/**
 * Generate a default label for a tool based on its name and status.
 */
export function generateToolLabel(
  toolName: string,
  status: ToolCallStatus,
): string {
  const humanName = humanizeToolName(toolName)

  switch (status) {
    case "pending":
      return `${capitalize(humanName)}...`
    case "awaiting_approval":
      return `Approve ${humanName}?`
    case "approved":
      return `${capitalize(humanName)}...`
    case "denied":
      return "Cancelled"
    case "completed":
      return capitalize(humanName)
    case "failed":
      return `${capitalize(humanName)} failed`
  }
}

/**
 * Resolve the label for a tool call using the display config.
 * Falls back to auto-generated label if no config is provided.
 */
export function resolveToolLabel(
  toolName: string,
  args: unknown,
  status: ToolCallStatus,
  config?: ToolDisplayConfig,
): string {
  // Try tool-specific config first
  const toolConfig = config?.[toolName]
  if (toolConfig?.label) {
    if (typeof toolConfig.label === "function") {
      return toolConfig.label(args, status)
    }
    return toolConfig.label
  }

  // Try default config
  const defaultConfig = config?.["*"]
  if (defaultConfig?.label) {
    if (typeof defaultConfig.label === "function") {
      return defaultConfig.label(args, status)
    }
    return defaultConfig.label
  }

  // Fall back to auto-generated label
  return generateToolLabel(toolName, status)
}
