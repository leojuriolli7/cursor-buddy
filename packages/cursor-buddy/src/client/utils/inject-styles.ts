// Import CSS as string - need to configure bundler for this
import styles from "../styles.css?inline"

const STYLE_ID = "cursor-buddy-styles"

let injected = false

/**
 * Inject cursor buddy styles into the document head.
 * Safe to call multiple times - will only inject once.
 * No-op during SSR.
 */
export function injectStyles(): void {
  // Skip on server
  if (typeof document === "undefined") return

  // Skip if already injected
  if (injected) return

  // Check if style tag already exists (e.g., from a previous mount)
  if (document.getElementById(STYLE_ID)) {
    injected = true
    return
  }

  const head = document.head || document.getElementsByTagName("head")[0]
  const style = document.createElement("style")
  style.id = STYLE_ID
  style.textContent = styles

  // Insert at the beginning so user styles can override
  if (head.firstChild) {
    head.insertBefore(style, head.firstChild)
  } else {
    head.appendChild(style)
  }

  injected = true
}
