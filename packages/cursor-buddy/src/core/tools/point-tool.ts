import { tool } from "ai"
import { z } from "zod"

export const pointToolInputSchema = z.object({
  elementId: z
    .number()
    .int()
    .min(1)
    .describe(
      "The element ID from the DOM snapshot (e.g., @12 becomes elementId: 12). " +
        "Each element in the DOM snapshot has an @X identifier - use that number here.",
    ),

  label: z
    .string()
    .min(1)
    .max(24)
    .describe(
      "A very short label for the pointer bubble, ideally 2 to 4 words.",
    ),
})

export type PointToolInput = z.infer<typeof pointToolInputSchema>

export const pointTool = tool({
  description:
    "Visually point at an element on the user's screen. " +
    "Use this tool when the user asks you to locate, indicate, highlight, or show a specific visible target on screen. " +
    "Each element in the visible DOM snapshot has an @X identifier (like @5, @12, @34). " +
    "Find the element you want to point at in the DOM snapshot, note its @X ID, and pass that ID here. " +
    "Do not describe a pointing action in plain text instead of calling this tool. " +
    "Call this tool at most once per response, and only after your spoken reply.",

  inputSchema: pointToolInputSchema,

  execute: async (params) => {
    return `Pointed at "${params.label}" (element @${params.elementId}) on the user's screen.`
  },
})
