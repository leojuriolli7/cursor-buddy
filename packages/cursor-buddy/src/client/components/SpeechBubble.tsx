import type { SpeechBubbleRenderProps } from "../../core/types"

/**
 * Default speech bubble component.
 * Displays pointing label or response text next to the cursor.
 */
export function DefaultSpeechBubble({ text, isVisible }: SpeechBubbleRenderProps) {
  if (!isVisible || !text) return null

  return <div className="cursor-buddy-bubble">{text}</div>
}
