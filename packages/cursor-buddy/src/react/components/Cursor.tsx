import type { CursorRenderProps } from "../../core/types";

// -30 degrees ≈ -0.52 radians (standard cursor tilt)
const BASE_ROTATION = -Math.PI / 6;

/**
 * Default cursor component - a colored triangle pointer.
 * Color and animations change based on voice state via CSS classes.
 */
export function DefaultCursor({ state, rotation, scale }: CursorRenderProps) {
  const stateClass = `cursor-buddy-cursor--${state}`;

  return (
    <svg
      width="32"
      height="32"
      viewBox="0 0 32 32"
      className={`cursor-buddy-cursor ${stateClass}`}
      style={{
        transform: `rotate(${BASE_ROTATION + rotation}rad) scale(${scale})`,
      }}
    >
      <polygon points="16,4 28,28 16,22 4,28" />
    </svg>
  );
}
