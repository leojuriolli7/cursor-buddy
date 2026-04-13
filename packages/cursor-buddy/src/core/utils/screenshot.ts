import html2canvas from "html2canvas-pro"
import type { ScreenshotResult, AnnotatedScreenshotResult } from "../types"
import { createMarkerMap } from "./elements"
import { createAnnotatedCanvas, generateMarkerContext } from "./annotations"

function getCaptureMetrics() {
  return {
    viewportWidth: window.innerWidth,
    viewportHeight: window.innerHeight,
  }
}

/**
 * Create a fallback canvas when screenshot capture fails.
 * Returns a simple gray canvas with an error message.
 */
function createFallbackCanvas(): HTMLCanvasElement {
  const canvas = document.createElement("canvas")
  canvas.width = window.innerWidth
  canvas.height = window.innerHeight

  const ctx = canvas.getContext("2d")
  if (ctx) {
    ctx.fillStyle = "#f0f0f0"
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.fillStyle = "#666"
    ctx.font = "16px sans-serif"
    ctx.textAlign = "center"
    ctx.fillText("Screenshot unavailable", canvas.width / 2, canvas.height / 2)
  }

  return canvas
}

/**
 * Capture a screenshot of the current viewport.
 * Uses html2canvas to render the DOM to a canvas, then exports as JPEG.
 * Falls back to a placeholder if capture fails (e.g., due to unsupported CSS).
 */
export async function captureViewport(): Promise<ScreenshotResult> {
  const captureMetrics = getCaptureMetrics()
  let canvas: HTMLCanvasElement

  try {
    canvas = await html2canvas(document.body, {
      scale: 1,
      useCORS: true,
      logging: false,
      width: captureMetrics.viewportWidth,
      height: captureMetrics.viewportHeight,
      x: window.scrollX,
      y: window.scrollY,
    })
  } catch {
    canvas = createFallbackCanvas()
  }

  return {
    imageData: canvas.toDataURL("image/png"),
    width: canvas.width,
    height: canvas.height,
    viewportWidth: captureMetrics.viewportWidth,
    viewportHeight: captureMetrics.viewportHeight,
  }
}

/**
 * Capture an annotated screenshot of the current viewport.
 * Interactive elements are marked with numbered labels.
 * Returns both the annotated image and a marker map for resolving IDs.
 */
export async function captureAnnotatedViewport(): Promise<AnnotatedScreenshotResult> {
  const captureMetrics = getCaptureMetrics()

  // 1. Discover interactive elements BEFORE capturing screenshot
  //    (so rects are accurate to what's visible)
  const markerMap = createMarkerMap()

  // 2. Capture screenshot
  let sourceCanvas: HTMLCanvasElement
  try {
    sourceCanvas = await html2canvas(document.body, {
      scale: 1,
      useCORS: true,
      logging: false,
      width: captureMetrics.viewportWidth,
      height: captureMetrics.viewportHeight,
      x: window.scrollX,
      y: window.scrollY,
    })
  } catch {
    sourceCanvas = createFallbackCanvas()
  }

  // 3. Create a fresh canvas and draw annotations on it
  //    (html2canvas leaves dirty context state - transforms, clipping, etc.)
  const canvas =
    markerMap.size > 0
      ? createAnnotatedCanvas(sourceCanvas, markerMap)
      : sourceCanvas

  // 4. Generate marker context for AI
  const markerContext = generateMarkerContext(markerMap)

  return {
    imageData: canvas.toDataURL("image/png"),
    width: canvas.width,
    height: canvas.height,
    viewportWidth: captureMetrics.viewportWidth,
    viewportHeight: captureMetrics.viewportHeight,
    markerMap,
    markerContext,
  }
}
