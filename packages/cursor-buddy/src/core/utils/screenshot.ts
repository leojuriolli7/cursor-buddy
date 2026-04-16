import html2canvas from "html2canvas-pro"
import type { ScreenshotResult } from "../types"
import { buildVisibleDomSnapshot } from "./dom-snapshot"

const CLONE_RESOURCE_TIMEOUT_MS = 3000

/** Maximum width for compressed screenshots (maintains aspect ratio) */
const MAX_SCREENSHOT_WIDTH = 1920

/** JPEG quality for compressed screenshots (0-1) - higher quality for clearer details */
const JPEG_QUALITY = 0.95

/**
 * Compression result with compressed image data and dimensions.
 */
interface CompressionResult {
  /** Base64-encoded compressed image data */
  imageData: string
  /** Width of the compressed image */
  width: number
  /** Height of the compressed image */
  height: number
}

/**
 * Compress a canvas image by downscaling and converting to JPEG.
 * Maintains aspect ratio and falls back to original if compression fails.
 *
 * @param sourceCanvas - The source canvas to compress
 * @param maxWidth - Maximum width for the compressed image (default: MAX_SCREENSHOT_WIDTH)
 * @param quality - JPEG quality 0-1 (default: JPEG_QUALITY)
 * @returns Compression result with compressed image data and dimensions
 */
function compressImage(
  sourceCanvas: HTMLCanvasElement,
  maxWidth: number = MAX_SCREENSHOT_WIDTH,
  quality: number = JPEG_QUALITY,
): CompressionResult {
  const sourceWidth = sourceCanvas.width
  const sourceHeight = sourceCanvas.height

  // If source is already smaller than max width, just convert to JPEG
  if (sourceWidth <= maxWidth) {
    return {
      imageData: sourceCanvas.toDataURL("image/jpeg", quality),
      width: sourceWidth,
      height: sourceHeight,
    }
  }

  // Calculate scaled dimensions maintaining aspect ratio
  const scale = maxWidth / sourceWidth
  const targetWidth = Math.round(maxWidth)
  const targetHeight = Math.round(sourceHeight * scale)

  // Create canvas for compressed image
  const canvas = document.createElement("canvas")
  canvas.width = targetWidth
  canvas.height = targetHeight

  const ctx = canvas.getContext("2d")
  if (!ctx) {
    // Fallback: return original as JPEG
    return {
      imageData: sourceCanvas.toDataURL("image/jpeg", quality),
      width: sourceWidth,
      height: sourceHeight,
    }
  }

  // Use better quality scaling
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = "high"

  // Draw scaled image
  ctx.drawImage(sourceCanvas, 0, 0, targetWidth, targetHeight)

  // Export as JPEG
  return {
    imageData: canvas.toDataURL("image/jpeg", quality),
    width: targetWidth,
    height: targetHeight,
  }
}

function getCaptureMetrics() {
  return {
    viewportWidth: window.innerWidth,
    viewportHeight: window.innerHeight,
  }
}

function waitForNextPaint(doc: Document): Promise<void> {
  const view = doc.defaultView
  if (!view?.requestAnimationFrame) return Promise.resolve()

  return new Promise((resolve) => {
    view.requestAnimationFrame(() => {
      view.requestAnimationFrame(() => resolve())
    })
  })
}

function isStylesheetReady(link: HTMLLinkElement): boolean {
  const sheet = link.sheet
  if (!sheet) return false

  try {
    void sheet.cssRules
    return true
  } catch (error) {
    return error instanceof DOMException && error.name === "SecurityError"
  }
}

function waitForStylesheetLink(link: HTMLLinkElement): Promise<void> {
  if (isStylesheetReady(link)) return Promise.resolve()

  return new Promise((resolve) => {
    let settled = false
    let timeoutId = 0

    const finish = () => {
      if (settled) return
      settled = true
      window.clearTimeout(timeoutId)
      link.removeEventListener("load", handleReady)
      link.removeEventListener("error", handleReady)
      resolve()
    }

    const handleReady = () => {
      if (isStylesheetReady(link)) {
        finish()
        return
      }

      window.requestAnimationFrame(() => {
        if (isStylesheetReady(link)) {
          finish()
        }
      })
    }

    timeoutId = window.setTimeout(finish, CLONE_RESOURCE_TIMEOUT_MS)
    link.addEventListener("load", handleReady, { once: true })
    link.addEventListener("error", finish, { once: true })

    handleReady()
  })
}

async function waitForClonedDocumentStyles(doc: Document): Promise<void> {
  const stylesheetLinks = Array.from(
    doc.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"][href]'),
  )

  await Promise.all(stylesheetLinks.map(waitForStylesheetLink))

  if (doc.fonts?.ready) {
    await doc.fonts.ready
  }

  await waitForNextPaint(doc)
}

function getHtml2CanvasOptions(
  captureMetrics: ReturnType<typeof getCaptureMetrics>,
) {
  return {
    scale: window.devicePixelRatio,
    useCORS: true,
    logging: false,
    width: captureMetrics.viewportWidth,
    height: captureMetrics.viewportHeight,
    windowWidth: captureMetrics.viewportWidth,
    windowHeight: captureMetrics.viewportHeight,
    x: window.scrollX,
    y: window.scrollY,
    scrollX: window.scrollX,
    scrollY: window.scrollY,
    // In production Next.js emits external stylesheet links; wait for the
    // cloned iframe to finish applying them before html2canvas renders.
    onclone: async (doc: Document) => {
      await waitForClonedDocumentStyles(doc)
    },
  } as const
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
 * Capture a screenshot and DOM snapshot of the current viewport.
 * Uses html2canvas to render the DOM to a canvas, compresses to high-quality JPEG,
 * and builds a token-efficient DOM snapshot for AI context.
 * Falls back to a placeholder if capture fails.
 */
export async function captureViewport(): Promise<ScreenshotResult> {
  const captureMetrics = getCaptureMetrics()

  // 1. Capture screenshot
  let canvas: HTMLCanvasElement
  try {
    canvas = await html2canvas(
      document.body,
      getHtml2CanvasOptions(captureMetrics),
    )
  } catch {
    canvas = createFallbackCanvas()
  }

  // 2. Compress the screenshot (with fallback to uncompressed on error)
  let compressed: CompressionResult
  try {
    compressed = compressImage(canvas)
  } catch {
    // Fallback: use uncompressed PNG
    compressed = {
      imageData: canvas.toDataURL("image/png"),
      width: canvas.width,
      height: canvas.height,
    }
  }

  // 3. Build DOM snapshot for AI context
  const snapshot = buildVisibleDomSnapshot(document.body, {
    maxNodes: 1500,
    maxTextLength: 80,
    includeRects: true,
  })

  return {
    imageData: compressed.imageData,
    width: compressed.width,
    height: compressed.height,
    viewportWidth: captureMetrics.viewportWidth,
    viewportHeight: captureMetrics.viewportHeight,
    domSnapshot: snapshot.text,
    elementRegistry: snapshot.idToElement,
  }
}
