import { useContext } from "react"
import { CursorBuddyContext, type CursorBuddyContextValue } from "../context"

/**
 * Hook to access cursor buddy state and actions.
 * Must be used within a CursorBuddyProvider.
 */
export function useCursorBuddy(): CursorBuddyContextValue {
  const context = useContext(CursorBuddyContext)

  if (!context) {
    throw new Error("useCursorBuddy must be used within a CursorBuddyProvider")
  }

  return context
}
