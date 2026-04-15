import type { CursorRenderProps } from "../../core/types"

// -30 degrees ≈ -0.52 radians (standard cursor tilt)
const BASE_ROTATION = -Math.PI / 6

/**
 * Spinner component for processing state.
 * A simple ring spinner using SVG animateTransform.
 */
function ProcessingSpinner({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      xmlns="http://www.w3.org/2000/svg"
      width="12"
      height="12"
      viewBox="0 0 24 24"
    >
      <path
        fill="currentColor"
        d="M12,4a8,8,0,0,1,7.89,6.7A1.53,1.53,0,0,0,21.38,12h0a1.5,1.5,0,0,0,1.48-1.75,11,11,0,0,0-21.72,0A1.5,1.5,0,0,0,2.62,12h0a1.53,1.53,0,0,0,1.49-1.3A8,8,0,0,1,12,4Z"
      >
        <animateTransform
          attributeName="transform"
          dur="0.75s"
          repeatCount="indefinite"
          type="rotate"
          values="0 12 12;360 12 12"
        />
      </path>
    </svg>
  )
}

/**
 * Default cursor component - a colored triangle pointer.
 * Color and animations change based on voice state via CSS classes.
 */
export function DefaultCursor({
  state,
  rotation,
  scale,
  isPointing,
}: CursorRenderProps) {
  const stateClass = `cursor-buddy-cursor--${state}`
  const showSpinner = state === "processing" && !isPointing

  return (
    <div
      className={`cursor-buddy-cursor ${stateClass}`}
      style={{
        transform: `rotate(${BASE_ROTATION + rotation}rad) scale(${scale})`,
        transformOrigin: "8px 2px",
        display: "flex",
        alignItems: "center",
        gap: "4px",
      }}
    >
      <svg width="16" height="16" viewBox="0 0 16 16">
        <polygon points="8,2 14,14 8,11 2,14" />
      </svg>
      {showSpinner && (
        <ProcessingSpinner className="cursor-buddy-cursor__spinner" />
      )}
    </div>
  )
}
