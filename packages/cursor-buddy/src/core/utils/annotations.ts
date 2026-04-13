/**
 * Annotation drawing for screenshots.
 * Draws numbered markers on interactive elements.
 */

import type { MarkerMap } from "./elements"

/**
 * Annotation style configuration.
 */
interface AnnotationStyle {
  /** Border color for marker boxes */
  borderColor: string
  /** Background color for number labels */
  labelBackground: string
  /** Text color for number labels */
  labelColor: string
  /** Border width in pixels */
  borderWidth: number
  /** Font size for labels */
  fontSize: number
  /** Padding around label text */
  labelPadding: number
}

const DEFAULT_STYLE: AnnotationStyle = {
  borderColor: "rgba(255, 0, 0, 0.8)",
  labelBackground: "rgba(255, 0, 0, 0.9)",
  labelColor: "#ffffff",
  borderWidth: 2,
  fontSize: 11,
  labelPadding: 4,
}

/**
 * Draw annotation markers onto a canvas.
 * Modifies the canvas in place.
 *
 * @param ctx Canvas 2D context to draw on
 * @param markers Marker map from element discovery
 * @param style Optional style overrides
 */
export function drawAnnotations(
  ctx: CanvasRenderingContext2D,
  markers: MarkerMap,
  style: Partial<AnnotationStyle> = {},
): void {
  const s = { ...DEFAULT_STYLE, ...style }

  ctx.save()

  for (const marker of markers.values()) {
    const { rect, id } = marker

    // Draw border box
    ctx.strokeStyle = s.borderColor
    ctx.lineWidth = s.borderWidth
    ctx.strokeRect(rect.left, rect.top, rect.width, rect.height)

    // Draw label
    const label = String(id)
    ctx.font = `bold ${s.fontSize}px monospace`
    const textMetrics = ctx.measureText(label)
    const textWidth = textMetrics.width
    const textHeight = s.fontSize

    // Label position: top-left of element, or inside if near viewport top
    const labelWidth = textWidth + s.labelPadding * 2
    const labelHeight = textHeight + s.labelPadding
    const labelX = rect.left - s.borderWidth
    const labelY = rect.top < labelHeight + 4 ? rect.top + 2 : rect.top - labelHeight

    // Label background
    ctx.fillStyle = s.labelBackground
    ctx.beginPath()
    ctx.roundRect(labelX, labelY, labelWidth, labelHeight, 2)
    ctx.fill()

    // Label text
    ctx.fillStyle = s.labelColor
    ctx.textBaseline = "top"
    ctx.fillText(label, labelX + s.labelPadding, labelY + s.labelPadding / 2)
  }

  ctx.restore()
}

/**
 * Create an annotated copy of a canvas.
 * Does not modify the original canvas.
 *
 * @param sourceCanvas Original screenshot canvas
 * @param markers Marker map from element discovery
 * @returns New canvas with annotations drawn
 */
export function createAnnotatedCanvas(
  sourceCanvas: HTMLCanvasElement,
  markers: MarkerMap,
): HTMLCanvasElement {
  const canvas = document.createElement("canvas")
  canvas.width = sourceCanvas.width
  canvas.height = sourceCanvas.height

  const ctx = canvas.getContext("2d")
  if (!ctx) {
    throw new Error("Failed to get canvas 2D context")
  }

  // Copy source image
  ctx.drawImage(sourceCanvas, 0, 0)

  // Draw annotations
  drawAnnotations(ctx, markers)

  return canvas
}

/**
 * Generate marker context string for AI prompt.
 * Lists available markers with their descriptions.
 *
 * @param markers Marker map from element discovery
 * @returns Formatted string listing markers
 */
export function generateMarkerContext(markers: MarkerMap): string {
  if (markers.size === 0) {
    return "No interactive elements detected."
  }

  const lines = ["Interactive elements (use marker number to point):"]

  for (const marker of markers.values()) {
    lines.push(`  ${marker.id}: ${marker.description}`)
  }

  return lines.join("\n")
}
