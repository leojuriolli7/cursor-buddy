/**
 * Normalize unknown thrown values into Error instances.
 */
export function toError(
  error: unknown,
  fallbackMessage: string = "Unknown error",
): Error {
  if (error instanceof Error) {
    return error
  }

  if (typeof error === "string" && error) {
    return new Error(error)
  }

  return new Error(fallbackMessage)
}
