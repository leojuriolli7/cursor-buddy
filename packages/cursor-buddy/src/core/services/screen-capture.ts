import { captureViewport } from "../utils/screenshot"
import type { ScreenshotResult } from "../types"

/**
 * Framework-agnostic service for capturing viewport screenshots.
 */
export class ScreenCaptureService {
  /**
   * Capture a screenshot of the current viewport.
   * @returns Screenshot result with image data and dimensions
   */
  async capture(): Promise<ScreenshotResult> {
    return captureViewport()
  }
}
