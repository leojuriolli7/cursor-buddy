"use client"

import { createContext, useContext, useState, useEffect } from "react"
import { CursorBuddyClient } from "../core/client"
import { $cursorPosition } from "../core/atoms"
import { injectStyles } from "./utils/inject-styles"
import type { CursorBuddyClientOptions } from "../core/types"

const CursorBuddyContext = createContext<CursorBuddyClient | null>(null)

export interface CursorBuddyProviderProps extends CursorBuddyClientOptions {
  /** API endpoint for cursor buddy server */
  endpoint: string
  /** Children */
  children: React.ReactNode
}

/**
 * Provider for cursor buddy. Creates and manages the client instance.
 */
export function CursorBuddyProvider({
  endpoint,
  children,
  onTranscript,
  onResponse,
  onPoint,
  onStateChange,
  onError,
}: CursorBuddyProviderProps) {
  const [client] = useState(
    () =>
      new CursorBuddyClient(endpoint, {
        onTranscript,
        onResponse,
        onPoint,
        onStateChange,
        onError,
      })
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
