"use client"

import type { ToolBubbleRenderProps, ToolCallStatus } from "../../core/tools"

export interface ToolBubbleProps extends ToolBubbleRenderProps {
  /** Custom render function (from toolDisplay config) */
  customRender?: (props: ToolBubbleRenderProps) => React.ReactNode
}

/**
 * Status icons for tool call states
 */
function StatusIcon({ status }: { status: ToolCallStatus }) {
  switch (status) {
    case "pending":
    case "approved":
      return (
        <span
          className="cursor-buddy-tool-icon cursor-buddy-tool-icon--spinner"
          aria-label="Loading"
        />
      )
    case "awaiting_approval":
      return (
        <span
          className="cursor-buddy-tool-icon cursor-buddy-tool-icon--question"
          aria-label="Needs approval"
        >
          ?
        </span>
      )
    case "completed":
      return (
        <span
          className="cursor-buddy-tool-icon cursor-buddy-tool-icon--check"
          aria-label="Completed"
        >
          &#x2713;
        </span>
      )
    case "denied":
      return (
        <span
          className="cursor-buddy-tool-icon cursor-buddy-tool-icon--denied"
          aria-label="Denied"
        >
          &#x2715;
        </span>
      )
    case "failed":
      return (
        <span
          className="cursor-buddy-tool-icon cursor-buddy-tool-icon--error"
          aria-label="Failed"
        >
          !
        </span>
      )
    default:
      return null
  }
}

/**
 * Default tool bubble component.
 * Displays tool call status with optional approve/deny buttons.
 */
export function ToolBubble({
  toolName,
  args,
  status,
  label,
  result,
  error,
  approve,
  deny,
  dismiss,
  customRender,
}: ToolBubbleProps) {
  // Use custom render if provided
  if (customRender) {
    return (
      <>
        {customRender({
          toolName,
          args,
          status,
          label,
          result,
          error,
          approve,
          deny,
          dismiss,
        })}
      </>
    )
  }

  const needsApproval = status === "awaiting_approval"
  const isTerminal =
    status === "completed" || status === "denied" || status === "failed"

  return (
    <div
      className={`cursor-buddy-tool-bubble cursor-buddy-tool-bubble--${status}`}
      role="status"
      aria-live="polite"
    >
      <div className="cursor-buddy-tool-bubble__content">
        <StatusIcon status={status} />
        <span className="cursor-buddy-tool-bubble__label">{label}</span>
      </div>

      {needsApproval && approve && deny && (
        <div className="cursor-buddy-tool-bubble__actions">
          <button
            type="button"
            className="cursor-buddy-tool-button cursor-buddy-tool-button--approve"
            onClick={approve}
            aria-label={`Approve ${toolName}`}
          >
            Yes
          </button>
          <button
            type="button"
            className="cursor-buddy-tool-button cursor-buddy-tool-button--deny"
            onClick={deny}
            aria-label={`Deny ${toolName}`}
          >
            No
          </button>
        </div>
      )}

      {isTerminal && (
        <button
          type="button"
          className="cursor-buddy-tool-bubble__dismiss"
          onClick={dismiss}
          aria-label="Dismiss"
        >
          &#x2715;
        </button>
      )}
    </div>
  )
}
