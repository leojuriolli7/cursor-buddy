"use client"

import { CursorBuddy } from "cursor-buddy/react"
import { Toaster, toast } from "sonner"

export function Providers() {
  return (
    <>
      <CursorBuddy
        transcription={{
          mode: "auto",
        }}
        speech={{
          mode: "server",
          allowStreaming: true,
        }}
        onError={(err) => {
          toast.error(err.message)
        }}
        endpoint="/api/cursor-buddy"
      />

      <Toaster richColors position="top-right" />
    </>
  )
}
