import type { CursorRenderProps } from "../../core/types"

/**
 * Default cursor component - a colored triangle pointer.
 * Color and animations change based on voice state via CSS classes.
 */
export function DefaultCursor({ state, rotation, scale }: CursorRenderProps) {
  const stateClass = `cursor-buddy-cursor--${state}`

  return (
    <svg
      width="32"
      height="32"
      viewBox="0 0 32 32"
      className={`cursor-buddy-cursor ${stateClass}`}
      style={{
        transform: `rotate(${rotation}rad) scale(${scale})`,
      }}
    >
      <polygon points="16,4 28,28 16,22 4,28" />
    </svg>
  )
}
