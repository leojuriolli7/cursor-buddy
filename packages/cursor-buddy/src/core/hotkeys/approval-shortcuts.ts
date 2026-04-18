/**
 * Approval shortcut keys
 */
const APPROVE_KEYS = ["y", "enter"]
const DENY_KEYS = ["n", "escape"]

export interface ApprovalShortcutController {
  /** Whether the controller is currently enabled */
  readonly isEnabled: boolean
  /** Enable or disable the controller */
  setEnabled(enabled: boolean): void
  /** Clean up event listeners */
  destroy(): void
}

export interface ApprovalShortcutOptions {
  /** Called when user presses Y or Enter */
  onApprove: () => void
  /** Called when user presses N or Escape */
  onDeny: () => void
  /** Whether shortcuts are active (default: true) */
  enabled?: boolean
}

/**
 * Create a controller for approval keyboard shortcuts.
 *
 * Listens for:
 * - Y or Enter → onApprove
 * - N or Escape → onDeny
 *
 * @example
 * ```ts
 * const controller = createApprovalShortcutController({
 *   onApprove: () => approveToolCall(id),
 *   onDeny: () => denyToolCall(id),
 *   enabled: pendingApproval !== null,
 * })
 *
 * // Later, cleanup
 * controller.destroy()
 * ```
 */
export function createApprovalShortcutController(
  options: ApprovalShortcutOptions,
): ApprovalShortcutController {
  let enabled = options.enabled ?? true
  const { onApprove, onDeny } = options

  function handleKeyDown(event: KeyboardEvent) {
    if (!enabled) return

    // Ignore if user is typing in an input
    const target = event.target as HTMLElement
    if (
      target.tagName === "INPUT" ||
      target.tagName === "TEXTAREA" ||
      target.isContentEditable
    ) {
      return
    }

    const key = event.key.toLowerCase()

    if (APPROVE_KEYS.includes(key)) {
      event.preventDefault()
      onApprove()
    } else if (DENY_KEYS.includes(key)) {
      event.preventDefault()
      onDeny()
    }
  }

  // Attach listener
  window.addEventListener("keydown", handleKeyDown)

  return {
    get isEnabled() {
      return enabled
    },

    setEnabled(newEnabled: boolean) {
      enabled = newEnabled
    },

    destroy() {
      window.removeEventListener("keydown", handleKeyDown)
    },
  }
}
