import type { SpeechBubbleRenderProps } from "../../core/types"

/**
 * Default speech bubble component.
 * Displays pointing label or response text next to the cursor.
 */
export function DefaultSpeechBubble({
  text,
  isVisible,
  onClick,
}: SpeechBubbleRenderProps) {
  if (!isVisible || !text) return null

  return (
    <div
      className="cursor-buddy-bubble"
      onClick={onClick}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault()
          onClick?.()
        }
      }}
      role="button"
      tabIndex={0}
    >
      {text}
    </div>
  )
}
