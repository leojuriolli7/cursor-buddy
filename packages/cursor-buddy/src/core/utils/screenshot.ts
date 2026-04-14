import html2canvas from "html2canvas-pro"
import type { AnnotatedScreenshotResult, ScreenshotResult } from "../types"
import { createAnnotatedCanvas, generateMarkerContext } from "./annotations"
import { createMarkerMap } from "./elements"

const CLONE_RESOURCE_TIMEOUT_MS = 3000

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
    scale: 1,
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
 * Capture a screenshot of the current viewport.
 * Uses html2canvas to render the DOM to a canvas, then exports as JPEG.
 * Falls back to a placeholder if capture fails (e.g., due to unsupported CSS).
 */
export async function captureViewport(): Promise<ScreenshotResult> {
  const captureMetrics = getCaptureMetrics()
  let canvas: HTMLCanvasElement

  try {
    canvas = await html2canvas(
      document.body,
      getHtml2CanvasOptions(captureMetrics),
    )
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
    sourceCanvas = await html2canvas(
      document.body,
      getHtml2CanvasOptions(captureMetrics),
    )
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
