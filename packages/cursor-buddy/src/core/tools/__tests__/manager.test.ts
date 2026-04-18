import { beforeEach, describe, expect, it, vi } from "vitest"
import { ToolCallManager } from "../manager"
import type { ToolCallManagerCallbacks } from "../types"

describe("ToolCallManager", () => {
  let manager: ToolCallManager
  let callbacks: ToolCallManagerCallbacks

  beforeEach(() => {
    callbacks = {
      onChange: vi.fn(),
      onApprovalResponse: vi.fn().mockResolvedValue(undefined),
    }
    manager = new ToolCallManager(callbacks)
  })

  describe("handleToolCall", () => {
    it("adds a new tool call with pending status", () => {
      manager.handleToolCall({
        toolCallId: "tc-1",
        toolName: "web_search",
        args: { query: "test" },
      })

      const calls = manager.getToolCalls()
      expect(calls).toHaveLength(1)
      expect(calls[0].id).toBe("tc-1")
      expect(calls[0].toolName).toBe("web_search")
      expect(calls[0].status).toBe("pending")
      expect(callbacks.onChange).toHaveBeenCalled()
    })

    it("generates a label from the tool name", () => {
      manager.handleToolCall({
        toolCallId: "tc-1",
        toolName: "web_search",
        args: {},
      })

      const calls = manager.getToolCalls()
      expect(calls[0].label).toBe("Web search...")
    })
  })

  describe("handleApprovalRequest", () => {
    it("updates existing tool call to awaiting_approval", () => {
      manager.handleToolCall({
        toolCallId: "tc-1",
        toolName: "delete_file",
        args: { path: "/tmp/test" },
      })

      manager.handleApprovalRequest({
        approvalId: "ap-1",
        toolCallId: "tc-1",
        toolName: "delete_file",
        args: { path: "/tmp/test" },
      })

      const calls = manager.getToolCalls()
      expect(calls[0].status).toBe("awaiting_approval")
      expect(calls[0].approvalId).toBe("ap-1")
    })

    it("creates new entry if tool call was not seen", () => {
      manager.handleApprovalRequest({
        approvalId: "ap-1",
        toolCallId: "tc-1",
        toolName: "delete_file",
        args: { path: "/tmp/test" },
      })

      const calls = manager.getToolCalls()
      expect(calls).toHaveLength(1)
      expect(calls[0].status).toBe("awaiting_approval")
    })
  })

  describe("handleToolResult", () => {
    it("updates tool call to completed", () => {
      manager.handleToolCall({
        toolCallId: "tc-1",
        toolName: "web_search",
        args: {},
      })

      manager.handleToolResult({
        toolCallId: "tc-1",
        result: { data: "found" },
      })

      const calls = manager.getToolCalls()
      expect(calls[0].status).toBe("completed")
      expect(calls[0].result).toEqual({ data: "found" })
    })

    it("ignores unknown tool call IDs", () => {
      manager.handleToolResult({
        toolCallId: "unknown",
        result: {},
      })

      expect(manager.getToolCalls()).toHaveLength(0)
    })
  })

  describe("handleToolError", () => {
    it("updates tool call to failed", () => {
      manager.handleToolCall({
        toolCallId: "tc-1",
        toolName: "web_search",
        args: {},
      })

      manager.handleToolError({
        toolCallId: "tc-1",
        error: "Network error",
      })

      const calls = manager.getToolCalls()
      expect(calls[0].status).toBe("failed")
      expect(calls[0].error).toBe("Network error")
    })
  })

  describe("approve", () => {
    it("changes status to approved and calls callback", async () => {
      manager.handleApprovalRequest({
        approvalId: "ap-1",
        toolCallId: "tc-1",
        toolName: "delete_file",
        args: {},
      })

      await manager.approve("tc-1")

      const calls = manager.getToolCalls()
      expect(calls[0].status).toBe("approved")
      expect(callbacks.onApprovalResponse).toHaveBeenCalledWith("ap-1", true)
    })

    it("does nothing for non-awaiting tool calls", async () => {
      manager.handleToolCall({
        toolCallId: "tc-1",
        toolName: "web_search",
        args: {},
      })

      await manager.approve("tc-1")

      const calls = manager.getToolCalls()
      expect(calls[0].status).toBe("pending")
      expect(callbacks.onApprovalResponse).not.toHaveBeenCalled()
    })
  })

  describe("deny", () => {
    it("changes status to denied and calls callback", async () => {
      manager.handleApprovalRequest({
        approvalId: "ap-1",
        toolCallId: "tc-1",
        toolName: "delete_file",
        args: {},
      })

      await manager.deny("tc-1")

      const calls = manager.getToolCalls()
      expect(calls[0].status).toBe("denied")
      expect(callbacks.onApprovalResponse).toHaveBeenCalledWith("ap-1", false)
    })
  })

  describe("dismiss", () => {
    it("removes tool call immediately", () => {
      manager.handleToolCall({
        toolCallId: "tc-1",
        toolName: "web_search",
        args: {},
      })

      manager.dismiss("tc-1")

      expect(manager.getToolCalls()).toHaveLength(0)
    })
  })

  describe("getActiveToolCalls", () => {
    it("returns pending tool calls", () => {
      manager.handleToolCall({
        toolCallId: "tc-1",
        toolName: "web_search",
        args: {},
      })

      const active = manager.getActiveToolCalls()
      expect(active).toHaveLength(1)
    })

    it("returns awaiting_approval tool calls", () => {
      manager.handleApprovalRequest({
        approvalId: "ap-1",
        toolCallId: "tc-1",
        toolName: "delete_file",
        args: {},
      })

      const active = manager.getActiveToolCalls()
      expect(active).toHaveLength(1)
    })

    it("excludes hidden tools", () => {
      manager.setDisplayConfig({
        web_search: { mode: "hidden" },
      })

      manager.handleToolCall({
        toolCallId: "tc-1",
        toolName: "web_search",
        args: {},
      })

      const active = manager.getActiveToolCalls()
      expect(active).toHaveLength(0)
    })
  })

  describe("getPendingApproval", () => {
    it("returns tool awaiting approval", () => {
      manager.handleApprovalRequest({
        approvalId: "ap-1",
        toolCallId: "tc-1",
        toolName: "delete_file",
        args: {},
      })

      const pending = manager.getPendingApproval()
      expect(pending).not.toBeNull()
      expect(pending?.id).toBe("tc-1")
    })

    it("returns null when no approval pending", () => {
      manager.handleToolCall({
        toolCallId: "tc-1",
        toolName: "web_search",
        args: {},
      })

      expect(manager.getPendingApproval()).toBeNull()
    })
  })

  describe("reset", () => {
    it("clears all tool calls", () => {
      manager.handleToolCall({
        toolCallId: "tc-1",
        toolName: "web_search",
        args: {},
      })
      manager.handleToolCall({
        toolCallId: "tc-2",
        toolName: "delete_file",
        args: {},
      })

      manager.reset()

      expect(manager.getToolCalls()).toHaveLength(0)
    })
  })
})
