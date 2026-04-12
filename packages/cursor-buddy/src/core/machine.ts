import { setup, assign } from "xstate"
import type { VoiceMachineContext, VoiceMachineEvent } from "./types"

/**
 * XState machine for the voice interaction flow.
 *
 * States: idle → listening → processing → responding → idle
 *
 * This enforces valid state transitions and provides hooks for
 * actions (start/stop mic, capture screenshot, play TTS, etc.)
 */
export const cursorBuddyMachine = setup({
  types: {
    context: {} as VoiceMachineContext,
    events: {} as VoiceMachineEvent,
  },
  actions: {
    clearTranscript: assign({ transcript: "" }),
    clearResponse: assign({ response: "" }),
    clearError: assign({ error: null }),
    setTranscript: assign(({ event }) => {
      if (event.type === "TRANSCRIPTION_COMPLETE") {
        return { transcript: event.transcript }
      }
      return {}
    }),
    setResponse: assign(({ event }) => {
      if (event.type === "AI_RESPONSE_COMPLETE") {
        return { response: event.response }
      }
      return {}
    }),
    appendResponseChunk: assign(({ context, event }) => {
      if (event.type === "AI_RESPONSE_CHUNK") {
        return { response: context.response + event.text }
      }
      return {}
    }),
    setError: assign(({ event }) => {
      if (event.type === "ERROR") {
        return { error: event.error }
      }
      return {}
    }),
  },
}).createMachine({
  id: "cursorBuddy",
  initial: "idle",
  context: {
    transcript: "",
    response: "",
    error: null,
  },
  states: {
    idle: {
      entry: ["clearError"],
      on: {
        HOTKEY_PRESSED: {
          target: "listening",
          actions: ["clearTranscript", "clearResponse"],
        },
      },
    },
    listening: {
      on: {
        HOTKEY_RELEASED: {
          target: "processing",
        },
        CANCEL: {
          target: "idle",
        },
        ERROR: {
          target: "idle",
          actions: ["setError"],
        },
      },
    },
    processing: {
      on: {
        TRANSCRIPTION_COMPLETE: {
          actions: ["setTranscript"],
        },
        AI_RESPONSE_CHUNK: {
          actions: ["appendResponseChunk"],
        },
        AI_RESPONSE_COMPLETE: {
          target: "responding",
          actions: ["setResponse"],
        },
        ERROR: {
          target: "idle",
          actions: ["setError"],
        },
        CANCEL: {
          target: "idle",
        },
      },
    },
    responding: {
      on: {
        TTS_COMPLETE: {
          target: "idle",
        },
        POINTING_COMPLETE: {
          // Stay in responding until TTS is also complete
        },
        CANCEL: {
          target: "idle",
        },
        ERROR: {
          target: "idle",
          actions: ["setError"],
        },
      },
    },
  },
})

export type CursorBuddyMachine = typeof cursorBuddyMachine
