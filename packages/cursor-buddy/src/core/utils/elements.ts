/**
 * Element discovery for annotated screenshots.
 * Finds visible interactive elements and assigns marker IDs.
 */

/** Max characters for element descriptions passed to the model. */
const MAX_DESCRIPTION_LENGTH = 50

/** Pixels tolerance for grouping elements into the same visual row. */
const ROW_TOLERANCE_PX = 20

/**
 * Interactive element selectors - elements users would want to click/interact with.
 * Mirrors accessibility roles from agent-browser but using CSS selectors.
 */
const INTERACTIVE_SELECTORS = [
  // Buttons
  "button",
  '[role="button"]',
  'input[type="button"]',
  'input[type="submit"]',
  'input[type="reset"]',

  // Links
  "a[href]",
  '[role="link"]',

  // Form inputs
  'input:not([type="hidden"])',
  "textarea",
  "select",
  '[role="textbox"]',
  '[role="searchbox"]',
  '[role="combobox"]',
  '[role="listbox"]',
  '[role="slider"]',
  '[role="spinbutton"]',

  // Checkboxes and radios
  '[role="checkbox"]',
  '[role="radio"]',
  '[role="switch"]',

  // Menu items
  '[role="menuitem"]',
  '[role="menuitemcheckbox"]',
  '[role="menuitemradio"]',
  '[role="option"]',

  // Tabs
  '[role="tab"]',
  '[role="treeitem"]',

  // Media controls
  "video",
  "audio",

  // Custom interactive elements (opt-in)
  "[data-cursor-buddy-interactive]",
]

/**
 * Element marker with reference to actual DOM element.
 */
export interface ElementMarker {
  /** Sequential marker ID (1, 2, 3...) */
  id: number
  /** Reference to the actual DOM element */
  element: Element
  /** Bounding rect at time of capture */
  rect: DOMRect
  /** Brief description for AI context */
  description: string
}

/**
 * Map of marker ID to element marker.
 */
export type MarkerMap = Map<number, ElementMarker>

/**
 * Check if an element is visible in the viewport.
 */
function isElementVisible(
  element: Element,
  rect: DOMRect = element.getBoundingClientRect(),
): boolean {

  // Has size
  if (rect.width <= 0 || rect.height <= 0) return false

  // In viewport
  if (
    rect.bottom < 0 ||
    rect.top > window.innerHeight ||
    rect.right < 0 ||
    rect.left > window.innerWidth
  ) {
    return false
  }

  // Not hidden via CSS
  const style = window.getComputedStyle(element)
  if (style.visibility === "hidden" || style.display === "none") return false
  if (Number.parseFloat(style.opacity) === 0) return false

  return true
}

function truncateDescription(value: string): string {
  return value.slice(0, MAX_DESCRIPTION_LENGTH)
}

/**
 * Generate a brief description for an element.
 */
function describeElement(element: Element): string {
  const tag = element.tagName.toLowerCase()

  // Try aria-label first
  const ariaLabel = element.getAttribute("aria-label")
  if (ariaLabel) return truncateDescription(ariaLabel)

  // Try text content for buttons/links
  if (tag === "button" || tag === "a") {
    const text = element.textContent?.trim()
    if (text) return truncateDescription(text)
  }

  // Try placeholder for inputs
  if (tag === "input" || tag === "textarea") {
    const placeholder = element.getAttribute("placeholder")
    if (placeholder) return truncateDescription(placeholder)

    const type = element.getAttribute("type") || "text"
    return `${type} input`
  }

  // Try alt for images
  if (tag === "img") {
    const alt = element.getAttribute("alt")
    if (alt) return truncateDescription(alt)
    return "image"
  }

  // Try role
  const role = element.getAttribute("role")
  if (role) return role

  // Fallback to tag name
  return tag
}

interface VisibleInteractiveElement {
  element: Element
  rect: DOMRect
}

function collectVisibleInteractiveElements(): VisibleInteractiveElement[] {
  const selector = INTERACTIVE_SELECTORS.join(",")
  const allElements = document.querySelectorAll(selector)
  const visible: VisibleInteractiveElement[] = []

  for (const element of allElements) {
    const rect = element.getBoundingClientRect()
    if (!isElementVisible(element, rect)) continue

    visible.push({ element, rect })
  }

  visible.sort((a, b) => {
    // Primary: top position, grouped into approximate rows
    const rowDiff =
      Math.floor(a.rect.top / ROW_TOLERANCE_PX) -
      Math.floor(b.rect.top / ROW_TOLERANCE_PX)
    if (rowDiff !== 0) return rowDiff

    // Secondary: left position
    return a.rect.left - b.rect.left
  })

  return visible
}

/**
 * Find all visible interactive elements in the viewport.
 * Returns elements sorted by visual position (top-left to bottom-right).
 */
export function findInteractiveElements(): Element[] {
  return collectVisibleInteractiveElements().map(({ element }) => element)
}

/**
 * Create marker map from visible interactive elements.
 * Assigns sequential IDs starting from 1.
 */
export function createMarkerMap(): MarkerMap {
  const elements = collectVisibleInteractiveElements()
  const map: MarkerMap = new Map()

  elements.forEach(({ element, rect }, index) => {
    const id = index + 1
    map.set(id, {
      id,
      element,
      rect,
      description: describeElement(element),
    })
  })

  return map
}

/**
 * Get the center point of an element in viewport coordinates.
 */
export function getElementCenter(element: Element): { x: number; y: number } {
  const rect = element.getBoundingClientRect()
  return {
    x: Math.round(rect.left + rect.width / 2),
    y: Math.round(rect.top + rect.height / 2),
  }
}

/**
 * Resolve a marker ID to viewport coordinates.
 * Returns null if marker not found or element no longer visible.
 */
export function resolveMarkerToCoordinates(
  markerMap: MarkerMap,
  markerId: number,
): { x: number; y: number } | null {
  const marker = markerMap.get(markerId)
  if (!marker) return null

  // Check element still exists and is visible
  if (!document.contains(marker.element)) return null
  if (!isElementVisible(marker.element)) return null

  return getElementCenter(marker.element)
}
