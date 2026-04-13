import html2canvas from "html2canvas-pro"
import type { ScreenshotResult } from "../types"

const MAX_WIDTH = 1280

function getCaptureMetrics() {
  return {
    viewportWidth: window.innerWidth,
    viewportHeight: window.innerHeight,
  }
}

/**
 * Resize canvas to max width while maintaining aspect ratio
 */
function resizeCanvas(
  canvas: HTMLCanvasElement,
  maxWidth: number,
): HTMLCanvasElement {
  if (canvas.width <= maxWidth) {
    return canvas
  }

  const scale = maxWidth / canvas.width
  const resized = document.createElement("canvas")
  resized.width = maxWidth
  resized.height = Math.round(canvas.height * scale)

  const ctx = resized.getContext("2d")
  if (ctx) {
    ctx.drawImage(canvas, 0, 0, resized.width, resized.height)
  }

  return resized
}

/**
 * Create a fallback canvas when screenshot capture fails.
 * Returns a simple gray canvas with an error message.
 */
function createFallbackCanvas(): HTMLCanvasElement {
  const canvas = document.createElement("canvas")
  canvas.width = Math.min(window.innerWidth, MAX_WIDTH)
  canvas.height = Math.round(
    (window.innerHeight / window.innerWidth) * canvas.width,
  )

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

  const resized = resizeCanvas(canvas, MAX_WIDTH)

  return {
    imageData: resized.toDataURL("image/jpeg", 0.8),
    width: resized.width,
    height: resized.height,
    viewportWidth: captureMetrics.viewportWidth,
    viewportHeight: captureMetrics.viewportHeight,
  }
}
