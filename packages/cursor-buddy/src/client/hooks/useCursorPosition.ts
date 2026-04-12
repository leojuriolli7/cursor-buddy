import { useEffect } from "react"
import { $cursorPosition } from "../../core/atoms"

/**
 * Hook that tracks mouse cursor position and updates the $cursorPosition atom.
 * Should be used once at the provider level.
 */
export function useCursorPosition(): void {
  useEffect(() => {
    function handleMouseMove(event: MouseEvent) {
      $cursorPosition.set({ x: event.clientX, y: event.clientY })
    }

    window.addEventListener("mousemove", handleMouseMove)

    return () => {
      window.removeEventListener("mousemove", handleMouseMove)
    }
  }, [])
}
