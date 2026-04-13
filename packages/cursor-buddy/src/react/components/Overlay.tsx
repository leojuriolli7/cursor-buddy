"use client"

import { useStore } from "@nanostores/react"
import { useEffect, useState } from "react"
import { createPortal } from "react-dom"
import {
  $audioLevel,
  $buddyPosition,
  $buddyRotation,
  $buddyScale,
  $pointingTarget,
} from "../../core/atoms"
import type {
  CursorRenderProps,
  SpeechBubbleRenderProps,
  WaveformRenderProps,
} from "../../core/types"
import { useCursorBuddy } from "../hooks"
import { DefaultCursor } from "./Cursor"
import { DefaultSpeechBubble } from "./SpeechBubble"
import { DefaultWaveform } from "./Waveform"

export interface OverlayProps {
  /** Custom cursor renderer */
  cursor?: React.ReactNode | ((props: CursorRenderProps) => React.ReactNode)
  /** Custom speech bubble renderer */
  speechBubble?: (props: SpeechBubbleRenderProps) => React.ReactNode
  /** Custom waveform renderer */
  waveform?: (props: WaveformRenderProps) => React.ReactNode
  /** Container element for portal (defaults to document.body) */
  container?: HTMLElement | null
}

/**
 * Overlay component that renders the cursor, speech bubble, and waveform.
 * Uses React portal to render at the document body level.
 */
export function Overlay({
  cursor,
  speechBubble,
  waveform,
  container,
}: OverlayProps) {
  // Only render after mount to avoid hydration mismatch
  const [isMounted, setIsMounted] = useState(false)
  useEffect(() => setIsMounted(true), [])

  const { state, isPointing, isEnabled, dismissPointing } = useCursorBuddy()

  const buddyPosition = useStore($buddyPosition)
  const buddyRotation = useStore($buddyRotation)
  const buddyScale = useStore($buddyScale)
  const audioLevel = useStore($audioLevel)
  const pointingTarget = useStore($pointingTarget)

  // Don't render on server or when disabled
  if (!isMounted || !isEnabled) return null

  const cursorProps: CursorRenderProps = {
    state,
    isPointing,
    rotation: buddyRotation,
    scale: buddyScale,
  }

  const speechBubbleProps: SpeechBubbleRenderProps = {
    text: pointingTarget?.label ?? "",
    isVisible: isPointing && !!pointingTarget,
    onClick: dismissPointing,
  }

  const waveformProps: WaveformRenderProps = {
    audioLevel,
    isListening: state === "listening",
  }

  // Render cursor element
  const cursorElement =
    typeof cursor === "function" ? (
      cursor(cursorProps)
    ) : cursor ? (
      cursor
    ) : (
      <DefaultCursor {...cursorProps} />
    )

  // Render speech bubble element
  const speechBubbleElement = speechBubble ? (
    speechBubble(speechBubbleProps)
  ) : (
    <DefaultSpeechBubble {...speechBubbleProps} />
  )

  // Render waveform element
  const waveformElement = waveform ? (
    waveform(waveformProps)
  ) : (
    <DefaultWaveform {...waveformProps} />
  )

  const overlayContent = (
    <div className="cursor-buddy-overlay" data-cursor-buddy-overlay>
      <div
        className="cursor-buddy-container"
        style={{
          left: buddyPosition.x,
          top: buddyPosition.y,
        }}
      >
        {cursorElement}
        {state === "listening" && waveformElement}
        {isPointing && speechBubbleElement}
      </div>
    </div>
  )

  const portalContainer =
    container ?? (typeof document !== "undefined" ? document.body : null)

  if (!portalContainer) return null

  return createPortal(overlayContent, portalContainer)
}
