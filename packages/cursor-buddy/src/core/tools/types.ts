/**
 * Tool call lifecycle status
 */
export type ToolCallStatus =
  | "pending" // Tool called, waiting for result or approval request
  | "awaiting_approval" // Needs user consent
  | "approved" // User approved, executing
  | "denied" // User denied
  | "completed" // Finished successfully
  | "failed" // Execution failed

/**
 * Internal tool call state tracked by ToolCallManager
 */
export interface ToolCallState {
  /** Unique tool call ID from the stream */
  id: string
  /** Name of the tool */
  toolName: string
  /** Arguments passed to the tool */
  args: unknown
  /** Current status */
  status: ToolCallStatus
  /** Pre-resolved label from config or auto-generated */
  label: string
  /** Tool result when completed */
  result?: unknown
  /** Error message when failed */
  error?: string
  /** Approval ID for approval flow */
  approvalId?: string
  /** Timestamp when tool entered the queue */
  enteredQueueAt: number
}

/**
 * Render props for tool bubble components
 */
export interface ToolBubbleRenderProps {
  /** Name of the tool */
  toolName: string
  /** Arguments passed to the tool */
  args: unknown
  /** Current status */
  status: ToolCallStatus
  /** Pre-resolved label */
  label: string
  /** Tool result when completed */
  result?: unknown
  /** Error message when failed */
  error?: string
  /** Approve the tool call (only when status === "awaiting_approval") */
  approve?: () => void
  /** Deny the tool call (only when status === "awaiting_approval") */
  deny?: () => void
  /** Dismiss the bubble manually */
  dismiss: () => void
}

/**
 * Error handler return types
 */
export type ToolErrorHandlerResult =
  | void
  | { label: string }
  | { hide: true }
  | { render: (props: ToolBubbleRenderProps) => React.ReactNode }

/**
 * Configuration for displaying a single tool
 */
export interface ToolDisplayOptions {
  /** Display mode. Default: "bubble" */
  mode?: "bubble" | "hidden"
  /** Label shown in bubble. Auto-generated if omitted. */
  label?: string | ((args: unknown, status: ToolCallStatus) => string)
  /** Minimum display time in ms. Default: 1500 */
  minDisplayTime?: number
  /** Custom render for bubble content */
  render?: (props: ToolBubbleRenderProps) => React.ReactNode
  /** Error handling */
  onError?: (error: string, args: unknown) => ToolErrorHandlerResult
}

/**
 * Tool display configuration map
 * Use "*" key for default options applied to all tools
 */
export interface ToolDisplayConfig {
  [toolName: string]: ToolDisplayOptions
}

/**
 * Event emitted when a tool is called
 */
export interface ToolCallEvent {
  /** Unique tool call ID */
  id: string
  /** Name of the tool */
  toolName: string
  /** Arguments passed to the tool */
  args: unknown
}

/**
 * Event emitted when a tool completes
 */
export interface ToolResultEvent {
  /** Tool call ID */
  id: string
  /** Name of the tool */
  toolName: string
  /** Tool result */
  result: unknown
}

/**
 * Callbacks for ToolCallManager
 */
export interface ToolCallManagerCallbacks {
  /** Called when tool calls change */
  onChange: () => void
  /** Send approval response to server and continue */
  onApprovalResponse: (approvalId: string, approved: boolean) => Promise<void>
}

/**
 * Default minimum display time for tool bubbles in ms
 */
export const DEFAULT_MIN_DISPLAY_TIME = 1500

/**
 * Brief display time after result arrives before removing bubble
 */
export const RESULT_LINGER_TIME = 300
