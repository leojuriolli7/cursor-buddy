import { tool } from "ai"
import { z } from "zod"

export const pointToolInputSchema = z
  .object({
    type: z
      .enum(["marker", "coordinates"])
      .describe(
        "How to point. Use 'marker' for interactive elements that have a marker. Use 'coordinates' only for visible non-interactive content without a marker.",
      ),

    markerId: z
      .number()
      .int()
      .min(0)
      .optional()
      .describe(
        "Required when type is 'marker'. The marker ID of the interactive element to point at.",
      ),

    x: z
      .number()
      .int()
      .min(0)
      .optional()
      .describe(
        "Required when type is 'coordinates'. The horizontal pixel coordinate from the left edge of the screenshot (0 = leftmost). Must be within the screenshot width.",
      ),

    y: z
      .number()
      .int()
      .min(0)
      .optional()
      .describe(
        "Required when type is 'coordinates'. The vertical pixel coordinate from the top edge of the screenshot (0 = topmost). Must be within the screenshot height.",
      ),

    label: z
      .string()
      .min(1)
      .max(24)
      .describe(
        "A very short label for the pointer bubble, ideally 2 to 4 words.",
      ),
  })
  .superRefine((value, ctx) => {
    if (value.type === "marker") {
      if (value.markerId == null) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["markerId"],
          message: "markerId is required when type is 'marker'.",
        })
      }

      if (value.x != null) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["x"],
          message: "x must not be provided when type is 'marker'.",
        })
      }

      if (value.y != null) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["y"],
          message: "y must not be provided when type is 'marker'.",
        })
      }
    }

    if (value.type === "coordinates") {
      if (value.x == null) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["x"],
          message: "x is required when type is 'coordinates'.",
        })
      }

      if (value.y == null) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["y"],
          message: "y is required when type is 'coordinates'.",
        })
      }

      if (value.markerId != null) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["markerId"],
          message: "markerId must not be provided when type is 'coordinates'.",
        })
      }
    }
  })

export type PointToolInput = z.infer<typeof pointToolInputSchema>

export const pointTool = tool({
  description:
    "Visually point at something on the user's screen. " +
    "Use this tool when the user asks you to locate, indicate, highlight, or show a specific visible target on screen. " +
    "Prefer type 'marker' for interactive elements that have a marker. " +
    "Use type 'coordinates' only for visible non-interactive content without a marker. " +
    "Do not describe a pointing action in plain text instead of calling this tool. " +
    "Call this tool at most once per response, and only after your spoken reply.",

  inputSchema: pointToolInputSchema,

  execute: async (params) => {
    return `Pointed at "${params.label}" on the user's screen.`
  },
})
