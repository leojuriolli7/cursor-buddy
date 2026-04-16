import type { ScreenCapturePort, ScreenshotResult } from "../types"
import { captureViewport } from "../utils/screenshot"

/**
 * Framework-agnostic service for capturing viewport screenshots.
 */
export class ScreenCaptureService implements ScreenCapturePort {
  /**
   * Capture a screenshot and DOM snapshot of the current viewport.
   * @returns Screenshot result with image data, dimensions, and DOM snapshot
   */
  async capture(): Promise<ScreenshotResult> {
    return captureViewport()
  }
}
