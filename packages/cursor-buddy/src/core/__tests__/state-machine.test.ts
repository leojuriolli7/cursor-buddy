import { describe, it, expect, vi } from "vitest"
import { createStateMachine } from "../state-machine"

describe("createStateMachine", () => {
  it("starts in idle state", () => {
    const machine = createStateMachine()
    expect(machine.getState()).toBe("idle")
  })

  it("transitions from idle to listening on HOTKEY_PRESSED", () => {
    const machine = createStateMachine()
    const result = machine.transition({ type: "HOTKEY_PRESSED" })

    expect(result).toBe(true)
    expect(machine.getState()).toBe("listening")
  })

  it("transitions from listening to processing on HOTKEY_RELEASED", () => {
    const machine = createStateMachine()
    machine.transition({ type: "HOTKEY_PRESSED" })
    const result = machine.transition({ type: "HOTKEY_RELEASED" })

    expect(result).toBe(true)
    expect(machine.getState()).toBe("processing")
  })

  it("transitions from processing to responding on AI_RESPONSE_COMPLETE", () => {
    const machine = createStateMachine()
    machine.transition({ type: "HOTKEY_PRESSED" })
    machine.transition({ type: "HOTKEY_RELEASED" })
    const result = machine.transition({
      type: "AI_RESPONSE_COMPLETE",
      response: "test",
    })

    expect(result).toBe(true)
    expect(machine.getState()).toBe("responding")
  })

  it("transitions from responding to idle on TTS_COMPLETE", () => {
    const machine = createStateMachine()
    machine.transition({ type: "HOTKEY_PRESSED" })
    machine.transition({ type: "HOTKEY_RELEASED" })
    machine.transition({ type: "AI_RESPONSE_COMPLETE", response: "test" })
    const result = machine.transition({ type: "TTS_COMPLETE" })

    expect(result).toBe(true)
    expect(machine.getState()).toBe("idle")
  })

  it("allows interruption from processing to listening", () => {
    const machine = createStateMachine()
    machine.transition({ type: "HOTKEY_PRESSED" })
    machine.transition({ type: "HOTKEY_RELEASED" })
    expect(machine.getState()).toBe("processing")

    const result = machine.transition({ type: "HOTKEY_PRESSED" })

    expect(result).toBe(true)
    expect(machine.getState()).toBe("listening")
  })

  it("allows interruption from responding to listening", () => {
    const machine = createStateMachine()
    machine.transition({ type: "HOTKEY_PRESSED" })
    machine.transition({ type: "HOTKEY_RELEASED" })
    machine.transition({ type: "AI_RESPONSE_COMPLETE", response: "test" })
    expect(machine.getState()).toBe("responding")

    const result = machine.transition({ type: "HOTKEY_PRESSED" })

    expect(result).toBe(true)
    expect(machine.getState()).toBe("listening")
  })

  it("returns false for invalid transitions", () => {
    const machine = createStateMachine()
    const result = machine.transition({ type: "TTS_COMPLETE" })

    expect(result).toBe(false)
    expect(machine.getState()).toBe("idle")
  })

  it("transitions to idle on ERROR from any state", () => {
    const machine = createStateMachine()
    machine.transition({ type: "HOTKEY_PRESSED" })
    machine.transition({ type: "HOTKEY_RELEASED" })
    expect(machine.getState()).toBe("processing")

    const result = machine.transition({
      type: "ERROR",
      error: new Error("test"),
    })

    expect(result).toBe(true)
    expect(machine.getState()).toBe("idle")
  })

  it("notifies subscribers on state change", () => {
    const machine = createStateMachine()
    const listener = vi.fn()

    machine.subscribe(listener)
    machine.transition({ type: "HOTKEY_PRESSED" })

    expect(listener).toHaveBeenCalledTimes(1)
  })

  it("unsubscribe works correctly", () => {
    const machine = createStateMachine()
    const listener = vi.fn()

    const unsubscribe = machine.subscribe(listener)
    unsubscribe()
    machine.transition({ type: "HOTKEY_PRESSED" })

    expect(listener).not.toHaveBeenCalled()
  })

  it("reset returns to idle state", () => {
    const machine = createStateMachine()
    machine.transition({ type: "HOTKEY_PRESSED" })
    machine.transition({ type: "HOTKEY_RELEASED" })
    expect(machine.getState()).toBe("processing")

    machine.reset()

    expect(machine.getState()).toBe("idle")
  })
})
