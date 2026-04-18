import { resolveToolLabel } from "./labels"
import {
  DEFAULT_MIN_DISPLAY_TIME,
  RESULT_LINGER_TIME,
  type ToolCallManagerCallbacks,
  type ToolCallState,
  type ToolCallStatus,
  type ToolDisplayConfig,
} from "./types"

/**
 * Manages tool call state, display timing, and approval flow.
 */
export class ToolCallManager {
  private toolCalls: Map<string, ToolCallState> = new Map()
  private displayConfig: ToolDisplayConfig
  private callbacks: ToolCallManagerCallbacks
  private removalTimers: Map<string, ReturnType<typeof setTimeout>> = new Map()

  constructor(
    callbacks: ToolCallManagerCallbacks,
    displayConfig?: ToolDisplayConfig,
  ) {
    this.callbacks = callbacks
    this.displayConfig = displayConfig ?? {}
  }

  /**
   * Update the display configuration.
   */
  setDisplayConfig(config: ToolDisplayConfig): void {
    this.displayConfig = config
  }

  /**
   * Handle a new tool call from the stream.
   */
  handleToolCall(event: {
    toolCallId: string
    toolName: string
    args: unknown
  }): void {
    const status: ToolCallStatus = "pending"
    const label = resolveToolLabel(
      event.toolName,
      event.args,
      status,
      this.displayConfig,
    )

    const toolCall: ToolCallState = {
      id: event.toolCallId,
      toolName: event.toolName,
      args: event.args,
      status,
      label,
      enteredQueueAt: Date.now(),
    }

    this.toolCalls.set(event.toolCallId, toolCall)
    this.callbacks.onChange()
  }

  /**
   * Handle an approval request for a tool call.
   */
  handleApprovalRequest(event: {
    approvalId: string
    toolCallId: string
    toolName: string
    args: unknown
  }): void {
    const existing = this.toolCalls.get(event.toolCallId)

    if (existing) {
      // Update existing tool call with approval info
      existing.status = "awaiting_approval"
      existing.approvalId = event.approvalId
      existing.label = resolveToolLabel(
        existing.toolName,
        existing.args,
        "awaiting_approval",
        this.displayConfig,
      )
    } else {
      // Create new tool call entry if we missed the initial tool-call event
      const label = resolveToolLabel(
        event.toolName,
        event.args,
        "awaiting_approval",
        this.displayConfig,
      )

      const toolCall: ToolCallState = {
        id: event.toolCallId,
        toolName: event.toolName,
        args: event.args,
        status: "awaiting_approval",
        label,
        approvalId: event.approvalId,
        enteredQueueAt: Date.now(),
      }

      this.toolCalls.set(event.toolCallId, toolCall)
    }

    this.callbacks.onChange()
  }

  /**
   * Handle a successful tool result.
   */
  handleToolResult(event: { toolCallId: string; result: unknown }): void {
    const toolCall = this.toolCalls.get(event.toolCallId)
    if (!toolCall) return

    toolCall.status = "completed"
    toolCall.result = event.result
    toolCall.label = resolveToolLabel(
      toolCall.toolName,
      toolCall.args,
      "completed",
      this.displayConfig,
    )

    this.scheduleRemoval(toolCall)
    this.callbacks.onChange()
  }

  /**
   * Handle a tool execution error.
   */
  handleToolError(event: { toolCallId: string; error: string }): void {
    const toolCall = this.toolCalls.get(event.toolCallId)
    if (!toolCall) return

    const config = this.getConfigFor(toolCall.toolName)
    const errorResult = config?.onError?.(event.error, toolCall.args)

    // Check for hide directive
    if (errorResult && "hide" in errorResult && errorResult.hide) {
      this.toolCalls.delete(event.toolCallId)
      this.callbacks.onChange()
      return
    }

    toolCall.status = "failed"
    toolCall.error = event.error

    // Use custom label or fall back to auto-generated
    if (errorResult && "label" in errorResult) {
      toolCall.label = errorResult.label
    } else {
      toolCall.label = resolveToolLabel(
        toolCall.toolName,
        toolCall.args,
        "failed",
        this.displayConfig,
      )
    }

    this.scheduleRemoval(toolCall)
    this.callbacks.onChange()
  }

  /**
   * Approve a pending tool call.
   */
  async approve(toolCallId: string): Promise<void> {
    const toolCall = this.toolCalls.get(toolCallId)
    if (!toolCall || toolCall.status !== "awaiting_approval") return
    if (!toolCall.approvalId) return

    toolCall.status = "approved"
    toolCall.label = resolveToolLabel(
      toolCall.toolName,
      toolCall.args,
      "approved",
      this.displayConfig,
    )
    this.callbacks.onChange()

    await this.callbacks.onApprovalResponse(toolCall.approvalId, true)
  }

  /**
   * Deny a pending tool call.
   */
  async deny(toolCallId: string): Promise<void> {
    const toolCall = this.toolCalls.get(toolCallId)
    if (!toolCall || toolCall.status !== "awaiting_approval") return
    if (!toolCall.approvalId) return

    toolCall.status = "denied"
    toolCall.label = resolveToolLabel(
      toolCall.toolName,
      toolCall.args,
      "denied",
      this.displayConfig,
    )
    this.scheduleRemoval(toolCall)
    this.callbacks.onChange()

    await this.callbacks.onApprovalResponse(toolCall.approvalId, false)
  }

  /**
   * Manually dismiss a tool call bubble.
   */
  dismiss(toolCallId: string): void {
    this.clearRemovalTimer(toolCallId)
    this.toolCalls.delete(toolCallId)
    this.callbacks.onChange()
  }

  /**
   * Get a tool call by ID.
   */
  getToolCall(id: string): ToolCallState | undefined {
    return this.toolCalls.get(id)
  }

  /**
   * Get all tool calls.
   */
  getToolCalls(): ToolCallState[] {
    return Array.from(this.toolCalls.values())
  }

  /**
   * Get active (visible, non-expired) tool calls.
   */
  getActiveToolCalls(): ToolCallState[] {
    const now = Date.now()

    return Array.from(this.toolCalls.values()).filter((toolCall) => {
      const config = this.getConfigFor(toolCall.toolName)

      // Hidden tools are not active
      if (config?.mode === "hidden") return false

      // Awaiting approval is always active
      if (toolCall.status === "awaiting_approval") return true

      // Pending and approved are always active
      if (toolCall.status === "pending" || toolCall.status === "approved") {
        return true
      }

      // Completed/failed/denied: check if still within display time
      const minTime = config?.minDisplayTime ?? DEFAULT_MIN_DISPLAY_TIME
      const elapsed = now - toolCall.enteredQueueAt

      return elapsed < minTime + RESULT_LINGER_TIME
    })
  }

  /**
   * Get the tool call awaiting approval, if any.
   */
  getPendingApproval(): ToolCallState | null {
    for (const toolCall of this.toolCalls.values()) {
      if (toolCall.status === "awaiting_approval") {
        return toolCall
      }
    }
    return null
  }

  /**
   * Clear all tool calls and timers.
   */
  reset(): void {
    for (const timer of this.removalTimers.values()) {
      clearTimeout(timer)
    }
    this.removalTimers.clear()
    this.toolCalls.clear()
    this.callbacks.onChange()
  }

  private getConfigFor(toolName: string) {
    return this.displayConfig[toolName] ?? this.displayConfig["*"]
  }

  private scheduleRemoval(toolCall: ToolCallState): void {
    this.clearRemovalTimer(toolCall.id)

    const config = this.getConfigFor(toolCall.toolName)
    const minTime = config?.minDisplayTime ?? DEFAULT_MIN_DISPLAY_TIME
    const elapsed = Date.now() - toolCall.enteredQueueAt
    const remaining = Math.max(0, minTime - elapsed) + RESULT_LINGER_TIME

    const timer = setTimeout(() => {
      this.toolCalls.delete(toolCall.id)
      this.removalTimers.delete(toolCall.id)
      this.callbacks.onChange()
    }, remaining)

    this.removalTimers.set(toolCall.id, timer)
  }

  private clearRemovalTimer(toolCallId: string): void {
    const existing = this.removalTimers.get(toolCallId)
    if (existing) {
      clearTimeout(existing)
      this.removalTimers.delete(toolCallId)
    }
  }
}
