import { SentenceBuffer } from "../speech/sentences"
import { parseStreamBuffer } from "./parser"
import type { StreamProcessorCallbacks, StreamTurnResult } from "./types"

/**
 * Processes a streaming AI SDK UI message stream.
 * Extracts text, tool calls, and speech segments.
 */
export class StreamProcessor {
  private callbacks: StreamProcessorCallbacks
  private sentenceBuffer: SentenceBuffer
  private buffer = ""
  private responseText = ""
  private pendingApproval: StreamTurnResult["pendingApproval"] = undefined

  constructor(callbacks: StreamProcessorCallbacks) {
    this.callbacks = callbacks
    this.sentenceBuffer = new SentenceBuffer()
  }

  /**
   * Process a raw chunk from the stream.
   */
  processChunk(chunk: string): void {
    this.buffer += chunk
    const { chunks, remainder } = parseStreamBuffer(this.buffer)
    this.buffer = remainder

    for (const parsed of chunks) {
      this.handleParsedChunk(parsed)
    }
  }

  /**
   * Finalize processing and return turn result.
   */
  finish(): StreamTurnResult {
    // Process any remaining buffer
    if (this.buffer) {
      const { chunks } = parseStreamBuffer(this.buffer + "\n")
      for (const parsed of chunks) {
        this.handleParsedChunk(parsed)
      }
      this.buffer = ""
    }

    // Flush remaining text for TTS
    const remainingText = this.sentenceBuffer.flush()
    if (remainingText) {
      this.callbacks.onSpeechSegment(remainingText)
    }

    return {
      responseText: this.responseText.trim(),
      requiresApprovalContinuation: this.pendingApproval !== undefined,
      pendingApproval: this.pendingApproval,
    }
  }

  /**
   * Get the current response text.
   */
  getResponseText(): string {
    return this.responseText
  }

  private handleParsedChunk(
    chunk: ReturnType<typeof parseStreamBuffer>["chunks"][number],
  ): void {
    switch (chunk.type) {
      case "text-delta":
        this.responseText += chunk.delta
        this.callbacks.onTextDelta(chunk.delta)

        // Extract complete sentences for TTS
        const sentences = this.sentenceBuffer.push(chunk.delta)
        for (const sentence of sentences) {
          this.callbacks.onSpeechSegment(sentence)
        }
        break

      case "tool-call":
        this.callbacks.onToolCall({
          toolCallId: chunk.toolCallId,
          toolName: chunk.toolName,
          args: chunk.args,
        })
        break

      case "tool-approval-request":
        this.pendingApproval = {
          approvalId: chunk.approvalId,
          toolCallId: chunk.toolCallId,
          toolName: chunk.toolName,
          args: chunk.args,
        }
        this.callbacks.onApprovalRequest({
          approvalId: chunk.approvalId,
          toolCallId: chunk.toolCallId,
          toolName: chunk.toolName,
          args: chunk.args,
        })
        break

      case "tool-result":
        this.callbacks.onToolResult({
          toolCallId: chunk.toolCallId,
          result: chunk.result,
        })
        break

      case "tool-result-error":
        this.callbacks.onToolError({
          toolCallId: chunk.toolCallId,
          error: chunk.error,
        })
        break

      case "finish":
        this.callbacks.onFinish()
        break

      case "error":
        this.callbacks.onError(chunk.errorText)
        break

      case "unknown":
        // Ignore unknown chunk types
        break
    }
  }
}
