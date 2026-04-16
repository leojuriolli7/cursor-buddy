/**
 * Builds a compact snapshot of the visible DOM for LLM context.
 *
 * Design goals:
 * - Keep the implementation simple and predictable.
 * - Do not infer semantics like roles, labels, or state.
 * - Only exclude a very small set of tags.
 * - Preserve tree structure for reasoning.
 * - Attach a numeric selector ID to each emitted element.
 */
export type SnapshotOptions = {
  /**
   * Maximum amount of text to keep per element.
   */
  maxTextLength?: number

  /**
   * Hard cap on emitted nodes.
   */
  maxNodes?: number

  /**
   * Whether to include element bounding rects.
   */
  includeRects?: boolean

  /**
   * Label for the header line.
   */
  rootLabel?: string

  /**
   * Which attributes to keep in the snapshot.
   * Keep this small to stay token-efficient.
   */
  includedAttributes?: string[]
}

export type SnapshotResult = {
  text: string
  idToElement: Map<number, HTMLElement>
  nodeCount: number
}

type SnapshotNode = {
  id: number
  tag: string
  text: string
  attrs: Record<string, string>
  rect?: { x: number; y: number; w: number; h: number }
  children: SnapshotNode[]
}

const EXCLUDED_TAGS = new Set(["script", "link", "style", "noscript", "head"])

const DEFAULT_INCLUDED_ATTRIBUTES = [
  "id",
  "name",
  "type",
  "placeholder",
  "href",
  "title",
  "value",
  "role",
]

export function buildVisibleDomSnapshot(
  root: Element | Document,
  options: SnapshotOptions = {},
): SnapshotResult {
  const {
    maxTextLength = 80,
    maxNodes = 1500,
    includeRects = true,
    rootLabel = "viewport",
    includedAttributes = DEFAULT_INCLUDED_ATTRIBUTES,
  } = options

  const doc = root instanceof Document ? root : root.ownerDocument || document
  const startRoot = root instanceof Document ? root.documentElement : root
  const win = doc.defaultView || window

  const viewportW = win.innerWidth || 0
  const viewportH = win.innerHeight || 0

  let nextId = 1
  let nodeCount = 0

  const idToElement = new Map<number, HTMLElement>()
  const lines: string[] = [`# ${rootLabel} ${viewportW}x${viewportH}`]

  /**
   * Returns true when the element is worth considering for the snapshot.
   *
   * This is intentionally simple:
   * - skip excluded tags
   * - skip hidden/display:none/visibility:hidden/etc
   * - skip zero-size elements
   * - skip elements fully outside the viewport
   */
  function isElementVisible(el: Element): boolean {
    const tag = el.tagName.toLowerCase()
    if (EXCLUDED_TAGS.has(tag)) return false

    if (!(el instanceof HTMLElement)) return false
    if (el.hidden) return false
    if (el.closest("head")) return false

    if (typeof el.checkVisibility === "function") {
      try {
        if (
          !el.checkVisibility({
            opacityProperty: true,
            visibilityProperty: true,
            contentVisibilityAuto: true,
          })
        ) {
          return false
        }
      } catch {
        // Ignore unsupported browser behavior and continue with manual checks.
      }
    }

    const style = win.getComputedStyle(el)

    if (style.display === "none") return false
    if (style.visibility === "hidden" || style.visibility === "collapse") {
      return false
    }
    if (style.opacity === "0") return false
    if (style.contentVisibility === "hidden") return false

    const rect = el.getBoundingClientRect()

    if (rect.width <= 0 || rect.height <= 0) return false
    if (rect.bottom <= 0 || rect.right <= 0) return false
    if (rect.top >= viewportH || rect.left >= viewportW) return false

    return true
  }

  /**
   * Extracts a compact text representation from the element itself.
   *
   * No semantic guessing:
   * - prefer innerText when available
   * - otherwise fall back to textContent
   * - normalize whitespace
   * - truncate aggressively
   */
  function getElementText(el: HTMLElement): string {
    const text = normalizeWhitespace(el.innerText || el.textContent || "")
    if (!text) return ""
    return truncate(text, maxTextLength)
  }

  /**
   * Keeps only a small allowlist of raw DOM attributes.
   *
   * This avoids dumping the full attribute bag, which is usually noisy
   * and expensive in tokens.
   */
  function getIncludedAttributes(el: HTMLElement): Record<string, string> {
    const attrs: Record<string, string> = {}

    for (const name of includedAttributes) {
      const value = el.getAttribute(name)
      if (value == null) continue

      const clean = truncate(normalizeWhitespace(value), maxTextLength)
      if (!clean) continue

      attrs[name] = clean
    }

    return attrs
  }

  /**
   * Rounds the client rect so the output is smaller and more stable.
   */
  function quantizeRect(el: HTMLElement) {
    const r = el.getBoundingClientRect()
    return {
      x: Math.max(0, Math.round(r.left)),
      y: Math.max(0, Math.round(r.top)),
      w: Math.round(r.width),
      h: Math.round(r.height),
    }
  }

  /**
   * Decides whether this node should be emitted.
   *
   * Simple rule:
   * - keep it if it has visible kept children
   * - or keep it if it has some text
   * - or keep it if it has at least one included attribute
   *
   * This allows non-semantic div-heavy UIs to survive without trying
   * to guess intent.
   */
  function shouldKeepNode(
    text: string,
    attrs: Record<string, string>,
    children: SnapshotNode[],
  ): boolean {
    if (children.length > 0) return true
    if (text.length > 0) return true
    if (Object.keys(attrs).length > 0) return true
    return false
  }

  /**
   * Single DFS traversal over the DOM.
   *
   * Complexity target:
   * - O(N) DOM walk
   * - O(1) work per element, aside from browser layout/style calls
   */
  function walk(el: Element): SnapshotNode | null {
    if (nodeCount >= maxNodes) return null
    if (!(el instanceof HTMLElement)) return null
    if (!isElementVisible(el)) return null

    const children: SnapshotNode[] = []

    for (const child of Array.from(el.children)) {
      const childNode = walk(child)
      if (childNode) children.push(childNode)
      if (nodeCount >= maxNodes) break
    }

    const text = getElementText(el)
    const attrs = getIncludedAttributes(el)

    if (!shouldKeepNode(text, attrs, children)) return null

    const id = nextId++
    nodeCount++

    idToElement.set(id, el)

    return {
      id,
      tag: el.tagName.toLowerCase(),
      text,
      attrs,
      rect: includeRects ? quantizeRect(el) : undefined,
      children,
    }
  }

  /**
   * Emits the final compact line-based format.
   *
   * Example:
   * @12 div "Settings" [id="settings"] [x=10 y=20 w=200 h=40]
   */
  function emit(node: SnapshotNode, depth: number) {
    const indent = "  ".repeat(depth)
    const parts: string[] = [`${indent}@${node.id} ${node.tag}`]

    if (node.text) {
      parts.push(`"${escapeQuotes(node.text)}"`)
    }

    for (const [key, value] of Object.entries(node.attrs)) {
      parts.push(`[${key}="${escapeQuotes(value)}"]`)
    }

    if (node.rect) {
      parts.push(
        `[x=${node.rect.x} y=${node.rect.y} w=${node.rect.w} h=${node.rect.h}]`,
      )
    }

    lines.push(parts.join(" "))

    for (const child of node.children) {
      emit(child, depth + 1)
    }
  }

  const tree = walk(startRoot)
  if (tree) emit(tree, 0)

  return {
    text: lines.join("\n"),
    idToElement,
    nodeCount,
  }
}

function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/g, " ").trim()
}

function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text
  return text.slice(0, maxLength - 1).trimEnd() + "…"
}

function escapeQuotes(text: string): string {
  return text.replace(/"/g, '\\"')
}
