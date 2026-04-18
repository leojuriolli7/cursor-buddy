"use client"

import type {
  ToolBubbleRenderProps,
  ToolCallState,
  ToolDisplayConfig,
} from "../../core/tools"
import { ToolBubble } from "./ToolBubble"

export interface ToolBubbleStackProps {
  /** Active tool calls to display */
  toolCalls: ToolCallState[]
  /** Tool display configuration */
  toolDisplay?: ToolDisplayConfig
  /** Approve a tool call */
  onApprove: (id: string) => void
  /** Deny a tool call */
  onDeny: (id: string) => void
  /** Dismiss a tool call bubble */
  onDismiss: (id: string) => void
  /** Custom render function for all bubbles (overrides per-tool config) */
  renderToolBubble?: (props: ToolBubbleRenderProps) => React.ReactNode
}

/**
 * Stack of tool bubbles displayed near the cursor.
 * Renders all active tool calls in a vertical column.
 */
export function ToolBubbleStack({
  toolCalls,
  toolDisplay,
  onApprove,
  onDeny,
  onDismiss,
  renderToolBubble,
}: ToolBubbleStackProps) {
  if (toolCalls.length === 0) return null

  return (
    <div className="cursor-buddy-tool-stack" role="region" aria-label="Tool calls">
      {toolCalls.map((toolCall) => {
        const toolConfig = toolDisplay?.[toolCall.toolName] ?? toolDisplay?.["*"]

        // Skip hidden tools
        if (toolConfig?.mode === "hidden") return null

        const needsApproval = toolCall.status === "awaiting_approval"

        const bubbleProps: ToolBubbleRenderProps = {
          toolName: toolCall.toolName,
          args: toolCall.args,
          status: toolCall.status,
          label: toolCall.label,
          result: toolCall.result,
          error: toolCall.error,
          approve: needsApproval ? () => onApprove(toolCall.id) : undefined,
          deny: needsApproval ? () => onDeny(toolCall.id) : undefined,
          dismiss: () => onDismiss(toolCall.id),
        }

        // Use global render override if provided
        if (renderToolBubble) {
          return (
            <div key={toolCall.id} className="cursor-buddy-tool-stack__item">
              {renderToolBubble(bubbleProps)}
            </div>
          )
        }

        return (
          <div key={toolCall.id} className="cursor-buddy-tool-stack__item">
            <ToolBubble {...bubbleProps} customRender={toolConfig?.render} />
          </div>
        )
      })}
    </div>
  )
}
