import { useCallback, useState } from "react"
import { captureViewport } from "../utils/screenshot"
import type { ScreenshotResult } from "../../core/types"

export interface UseScreenCaptureReturn {
  /** Capture a screenshot of the current viewport */
  capture: () => Promise<ScreenshotResult>
  /** Whether a capture is in progress */
  isCapturing: boolean
  /** Last captured screenshot (null if none) */
  lastCapture: ScreenshotResult | null
  /** Last error (null if none) */
  error: Error | null
}

/**
 * Hook for capturing viewport screenshots.
 */
export function useScreenCapture(): UseScreenCaptureReturn {
  const [isCapturing, setIsCapturing] = useState(false)
  const [lastCapture, setLastCapture] = useState<ScreenshotResult | null>(null)
  const [error, setError] = useState<Error | null>(null)

  const capture = useCallback(async (): Promise<ScreenshotResult> => {
    setIsCapturing(true)
    setError(null)

    try {
      const result = await captureViewport()
      setLastCapture(result)
      return result
    } catch (err) {
      const captureError =
        err instanceof Error ? err : new Error("Screenshot capture failed")
      setError(captureError)
      throw captureError
    } finally {
      setIsCapturing(false)
    }
  }, [])

  return { capture, isCapturing, lastCapture, error }
}
