"use client"

import { createContext, useContext, useEffect, useState } from "react"
import { $cursorPosition } from "../core/atoms"
import { CursorBuddyClient } from "../core/client"
import type {
  CursorBuddyClientOptions,
  CursorBuddySpeechConfig,
  CursorBuddyTranscriptionConfig,
} from "../core/types"
import { injectStyles } from "./utils/inject-styles"

const CursorBuddyContext = createContext<CursorBuddyClient | null>(null)

export interface CursorBuddyProviderProps extends CursorBuddyClientOptions {
  /** API endpoint for cursor buddy server */
  endpoint: string
  /** Transcription configuration */
  transcription?: CursorBuddyTranscriptionConfig
  /** Speech configuration */
  speech?: CursorBuddySpeechConfig
  /** Children */
  children: React.ReactNode
}

/**
 * Provider for cursor buddy. Creates and manages the client instance.
 */
export function CursorBuddyProvider({
  endpoint,
  transcription,
  speech,
  toolDisplay,
  children,
  onTranscript,
  onResponse,
  onPoint,
  onStateChange,
  onError,
  onToolCall,
  onToolResult,
}: CursorBuddyProviderProps) {
  const [client] = useState(
    () =>
      new CursorBuddyClient(endpoint, {
        onTranscript,
        onResponse,
        onPoint,
        onStateChange,
        onError,
        onToolCall,
        onToolResult,
        speech,
        transcription,
        toolDisplay,
      }),
  )

  // Inject styles on mount
  useEffect(() => {
    injectStyles()
  }, [])

  // Track cursor position
  useEffect(() => {
    function handleMouseMove(event: MouseEvent) {
      $cursorPosition.set({ x: event.clientX, y: event.clientY })
      client.updateCursorPosition()
    }

    window.addEventListener("mousemove", handleMouseMove)
    return () => window.removeEventListener("mousemove", handleMouseMove)
  }, [client])

  return (
    <CursorBuddyContext.Provider value={client}>
      {children}
    </CursorBuddyContext.Provider>
  )
}

/**
 * Get the cursor buddy client from context.
 * @internal
 */
export function useClient(): CursorBuddyClient {
  const client = useContext(CursorBuddyContext)
  if (!client) {
    throw new Error("useCursorBuddy must be used within CursorBuddyProvider")
  }
  return client
}
