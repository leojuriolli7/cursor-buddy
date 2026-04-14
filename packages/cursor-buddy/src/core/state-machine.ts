import type { VoiceEvent, VoiceState } from "./types"

/**
 * State transition table for the voice interaction flow.
 * Maps current state + event type to next state.
 */
const transitions: Record<
  VoiceState,
  Partial<Record<VoiceEvent["type"], VoiceState>>
> = {
  idle: {
    HOTKEY_PRESSED: "listening",
  },
  listening: {
    HOTKEY_RELEASED: "processing",
    ERROR: "idle",
  },
  processing: {
    RESPONSE_STARTED: "responding",
    TTS_COMPLETE: "idle",
    HOTKEY_PRESSED: "listening", // Interruption
    ERROR: "idle",
  },
  responding: {
    TTS_COMPLETE: "idle",
    HOTKEY_PRESSED: "listening", // Interruption
    ERROR: "idle",
  },
}

export interface StateMachine {
  /** Get current state */
  getState(): VoiceState
  /** Attempt a state transition. Returns true if transition was valid. */
  transition(event: VoiceEvent): boolean
  /** Subscribe to state changes */
  subscribe(listener: () => void): () => void
  /** Reset to idle state */
  reset(): void
}

/**
 * Create a simple typed state machine for the voice interaction flow.
 *
 * States: idle -> listening -> processing -> responding -> idle
 *
 * Supports interruption: pressing hotkey during processing or responding
 * immediately transitions back to listening.
 */
export function createStateMachine(initial: VoiceState = "idle"): StateMachine {
  let state = initial
  const listeners = new Set<() => void>()

  function notify() {
    listeners.forEach((listener) => listener())
  }

  return {
    getState: () => state,

    transition: (event: VoiceEvent): boolean => {
      const nextState = transitions[state][event.type]
      if (!nextState) return false

      state = nextState
      notify()
      return true
    },

    subscribe: (listener: () => void) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },

    reset: () => {
      state = "idle"
      notify()
    },
  }
}
