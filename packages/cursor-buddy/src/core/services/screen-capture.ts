import type {
  AnnotatedScreenshotResult,
  ScreenCapturePort,
  ScreenshotResult,
} from "../types"
import { captureAnnotatedViewport, captureViewport } from "../utils/screenshot"

/**
 * Framework-agnostic service for capturing viewport screenshots.
 */
export class ScreenCaptureService implements ScreenCapturePort {
  /**
   * Capture a screenshot of the current viewport.
   * @returns Screenshot result with image data and dimensions
   */
  async capture(): Promise<ScreenshotResult> {
    return captureViewport()
  }

  /**
   * Capture an annotated screenshot with marker overlays.
   * Interactive elements are marked with numbered labels.
   * @returns Annotated screenshot result with marker map
   */
  async captureAnnotated(): Promise<AnnotatedScreenshotResult> {
    return captureAnnotatedViewport()
  }
}
