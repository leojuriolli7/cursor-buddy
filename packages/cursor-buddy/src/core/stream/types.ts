/**
 * Parsed chunk from AI SDK UI message stream
 */
export type UIStreamChunk =
  | { type: "text-delta"; delta: string }
  | { type: "tool-call"; toolCallId: string; toolName: string; args: unknown }
  | {
      type: "tool-approval-request"
      approvalId: string
      toolCallId: string
      toolName: string
      args: unknown
    }
  | { type: "tool-result"; toolCallId: string; result: unknown }
  | { type: "tool-result-error"; toolCallId: string; error: string }
  | { type: "finish" }
  | { type: "error"; errorText: string }
  | { type: "unknown" }

/**
 * Callbacks for stream processing
 */
export interface StreamProcessorCallbacks {
  /** Called for each text delta */
  onTextDelta: (delta: string) => void
  /** Called when a complete sentence is ready for TTS */
  onSpeechSegment: (text: string) => void
  /** Called when a tool is invoked */
  onToolCall: (event: {
    toolCallId: string
    toolName: string
    args: unknown
  }) => void
  /** Called when a tool needs approval */
  onApprovalRequest: (event: {
    approvalId: string
    toolCallId: string
    toolName: string
    args: unknown
  }) => void
  /** Called when a tool completes successfully */
  onToolResult: (event: { toolCallId: string; result: unknown }) => void
  /** Called when a tool fails */
  onToolError: (event: { toolCallId: string; error: string }) => void
  /** Called when stream finishes */
  onFinish: () => void
  /** Called on stream error */
  onError: (error: string) => void
}

/**
 * Result of processing the stream for a turn
 */
export interface StreamTurnResult {
  /** Full response text */
  responseText: string
  /** Whether the turn requires approval continuation */
  requiresApprovalContinuation: boolean
  /** Pending approval info if continuation required */
  pendingApproval?: {
    approvalId: string
    toolCallId: string
    toolName: string
    args: unknown
  }
}
