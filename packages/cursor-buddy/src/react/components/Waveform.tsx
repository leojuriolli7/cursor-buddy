import { useEffect, useState } from "react"
import type { WaveformRenderProps } from "../../core/types"

const BAR_COUNT = 12
const EMPTY_BARS = Array.from({ length: BAR_COUNT }, () => 0)

/**
 * Default waveform component.
 * Shows audio level visualization during recording.
 */
export function DefaultWaveform({
  audioLevel,
  isListening,
}: WaveformRenderProps) {
  const [bars, setBars] = useState<number[]>(EMPTY_BARS)

  useEffect(() => {
    if (!isListening) {
      setBars(EMPTY_BARS)
      return
    }

    setBars((previousBars) => {
      const nextBars = previousBars.slice(1)
      nextBars.push(audioLevel)
      return nextBars
    })
  }, [audioLevel, isListening])

  if (!isListening) return null

  const displayBars = bars.map((level) => Math.pow(level, 0.65))

  return (
    <div className="cursor-buddy-waveform">
      {displayBars.map((level, i) => {
        const baseHeight = 4
        const variance = 0.75 + ((i + 1) % 3) * 0.12
        const height = baseHeight + level * 20 * variance

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
