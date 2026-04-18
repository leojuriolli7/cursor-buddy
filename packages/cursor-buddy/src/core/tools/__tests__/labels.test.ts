import { describe, expect, it } from "vitest"
import { generateToolLabel, resolveToolLabel } from "../labels"

describe("generateToolLabel", () => {
  it("generates pending label", () => {
    expect(generateToolLabel("web_search", "pending")).toBe("Web search...")
    expect(generateToolLabel("deleteFile", "pending")).toBe("Delete file...")
  })

  it("generates awaiting_approval label", () => {
    expect(generateToolLabel("web_search", "awaiting_approval")).toBe(
      "Approve web search?",
    )
    expect(generateToolLabel("deleteFile", "awaiting_approval")).toBe(
      "Approve delete file?",
    )
  })

  it("generates approved label", () => {
    expect(generateToolLabel("web_search", "approved")).toBe("Web search...")
  })

  it("generates completed label", () => {
    expect(generateToolLabel("web_search", "completed")).toBe("Web search")
    expect(generateToolLabel("deleteFile", "completed")).toBe("Delete file")
  })

  it("generates denied label", () => {
    expect(generateToolLabel("web_search", "denied")).toBe("Cancelled")
  })

  it("generates failed label", () => {
    expect(generateToolLabel("web_search", "failed")).toBe("Web search failed")
  })

  it("handles snake_case tool names", () => {
    expect(generateToolLabel("get_user_data", "pending")).toBe("Get user data...")
  })

  it("handles camelCase tool names", () => {
    expect(generateToolLabel("getUserData", "pending")).toBe("Get user data...")
  })

  it("handles PascalCase tool names", () => {
    expect(generateToolLabel("GetUserData", "pending")).toBe("Get user data...")
  })
})

describe("resolveToolLabel", () => {
  it("uses auto-generated label when no config", () => {
    const label = resolveToolLabel("web_search", {}, "pending", {})
    expect(label).toBe("Web search...")
  })

  it("uses string label from config", () => {
    const label = resolveToolLabel("web_search", {}, "pending", {
      web_search: { label: "Searching..." },
    })
    expect(label).toBe("Searching...")
  })

  it("uses function label from config", () => {
    const label = resolveToolLabel(
      "web_search",
      { query: "test" },
      "pending",
      {
        web_search: {
          label: (args, status) =>
            `Searching for "${(args as { query: string }).query}"`,
        },
      },
    )
    expect(label).toBe('Searching for "test"')
  })

  it("uses wildcard config as fallback", () => {
    const label = resolveToolLabel("any_tool", {}, "pending", {
      "*": { label: "Working..." },
    })
    expect(label).toBe("Working...")
  })

  it("prefers specific config over wildcard", () => {
    const label = resolveToolLabel("web_search", {}, "pending", {
      "*": { label: "Working..." },
      web_search: { label: "Searching..." },
    })
    expect(label).toBe("Searching...")
  })
})
