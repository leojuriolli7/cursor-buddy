/**
 * Normalize browser speech input and transcript output to a single-space form
 * so UI state and speech synthesis stay stable across browser event quirks.
 */
export function normalizeSpeechText(text: string): string {
  return text.replace(/\s+/g, " ").trim()
}

/**
 * Resolve the best browser locale to use for Web Speech APIs.
 *
 * We prefer the document language when the host app declares one, then fall
 * back to the browser locale, and finally to English as a stable default.
 */
export function resolveBrowserLanguage(): string {
  if (typeof document !== "undefined") {
    const documentLanguage = document.documentElement.lang.trim()
    if (documentLanguage) return documentLanguage
  }

  if (typeof navigator !== "undefined" && navigator.language) {
    return navigator.language
  }

  return "en-US"
}
