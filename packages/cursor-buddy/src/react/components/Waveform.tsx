import type { WaveformRenderProps } from "../../core/types"

const BAR_COUNT = 5

/**
 * Default waveform component.
 * Shows audio level visualization during recording.
 */
export function DefaultWaveform({
  audioLevel,
  isListening,
}: WaveformRenderProps) {
  if (!isListening) return null

  return (
    <div className="cursor-buddy-waveform">
      {Array.from({ length: BAR_COUNT }).map((_, i) => {
        // Create varied heights based on audio level and bar position
        const baseHeight = 4
        const variance = Math.sin((i / BAR_COUNT) * Math.PI) * 0.5 + 0.5
        const height = baseHeight + audioLevel * 16 * variance

        return (
          <div
            key={i}
            className="cursor-buddy-waveform-bar"
            style={{ height: `${height}px` }}
          />
        )
      })}
    </div>
  )
}
