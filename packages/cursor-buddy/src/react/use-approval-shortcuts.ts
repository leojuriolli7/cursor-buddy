"use client"

import { useEffect, useRef } from "react"
import {
  type ApprovalShortcutController,
  createApprovalShortcutController,
} from "../core/hotkeys"

/**
 * Hook for approval keyboard shortcuts.
 *
 * When enabled, listens for:
 * - Y or Enter → onApprove
 * - N or Escape → onDeny
 *
 * Automatically enables when `enabled` is true.
 * Ignores keypresses when focus is in an input/textarea.
 *
 * @param enabled - Whether shortcuts should be active
 * @param onApprove - Called when user presses Y or Enter
 * @param onDeny - Called when user presses N or Escape
 *
 * @example
 * ```tsx
 * useApprovalShortcuts(
 *   pendingApproval !== null,
 *   () => approveToolCall(pendingApproval.id),
 *   () => denyToolCall(pendingApproval.id)
 * )
 * ```
 */
export function useApprovalShortcuts(
  enabled: boolean,
  onApprove: () => void,
  onDeny: () => void,
): void {
  const onApproveRef = useRef(onApprove)
  const onDenyRef = useRef(onDeny)
  onApproveRef.current = onApprove
  onDenyRef.current = onDeny

  const controllerRef = useRef<ApprovalShortcutController | null>(null)

  useEffect(() => {
    controllerRef.current = createApprovalShortcutController({
      onApprove: () => onApproveRef.current(),
      onDeny: () => onDenyRef.current(),
      enabled,
    })

    return () => {
      controllerRef.current?.destroy()
      controllerRef.current = null
    }
  }, [])

  useEffect(() => {
    controllerRef.current?.setEnabled(enabled)
  }, [enabled])
}
