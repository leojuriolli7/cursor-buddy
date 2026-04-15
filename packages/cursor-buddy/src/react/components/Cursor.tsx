import type { CursorRenderProps } from "../../core/types"

// -30 degrees ≈ -0.52 radians (standard cursor tilt)
const BASE_ROTATION = -Math.PI / 6

/**
 * Default cursor component - a colored triangle pointer.
 * Color and animations change based on voice state via CSS classes.
 */
export function DefaultCursor({ state, rotation, scale }: CursorRenderProps) {
  const stateClass = `cursor-buddy-cursor--${state}`

  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      className={`cursor-buddy-cursor ${stateClass}`}
      style={{
        transform: `rotate(${BASE_ROTATION + rotation}rad) scale(${scale})`,
        transformOrigin: "8px 2px",
      }}
    >
      <polygon points="8,2 14,14 8,11 2,14" />
    </svg>
  )
}
