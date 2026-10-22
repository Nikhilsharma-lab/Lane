import { describe, expect, it, vi } from "vitest"
import { callAction, isSessionFailure, type ActionSession } from "./action-call"

const session = (): ActionSession & { order: string[] } => {
  const order: string[] = []
  return { order, current: vi.fn(async () => { order.push("current") }), renew: vi.fn(async () => { order.push("renew") }) }
}

describe("callAction", () => {
  it("refreshes a lapsed token before the first call, then returns the action's result", async () => {
    const s = session()
    const run = vi.fn(async () => { s.order.push("run"); return { error: "Not found" } })
    await expect(callAction(run, s)).resolves.toEqual({ error: "Not found" })
    expect(s.order).toEqual(["current", "run"])
  })
  it("retries once with a new token when the action reads as signed out", async () => {
    const s = session()
    const run = vi.fn().mockResolvedValueOnce({ error: "You can't change Requests in this workspace." }).mockResolvedValueOnce({ success: true })
    await expect(callAction(run, s)).resolves.toEqual({ success: true })
    expect(run).toHaveBeenCalledTimes(2)
    expect(s.renew).toHaveBeenCalledTimes(1)
  })
  it("retries an Intake session_expired answer, and returns the second answer whatever it is", async () => {
    const s = session()
    const expired = { success: false, error: { code: "session_expired", message: "Sign in again." } }
    const run = vi.fn(async () => expired)
    await expect(callAction(run, s)).resolves.toBe(expired)
    expect(run).toHaveBeenCalledTimes(2)
  })
  it("rethrows a throw that isn't about the session, without retrying", async () => {
    const s = session()
    const run = vi.fn(async () => { throw new TypeError("Failed to fetch") })
    await expect(callAction(run, s)).rejects.toThrow("Failed to fetch")
    expect(run).toHaveBeenCalledTimes(1)
    expect(s.renew).not.toHaveBeenCalled()
  })
  it("retries an auth-shaped throw once", async () => {
    const s = session()
    const run = vi.fn().mockRejectedValueOnce(new Error("401 Unauthorized")).mockResolvedValueOnce({ success: true })
    await expect(callAction(run, s)).resolves.toEqual({ success: true })
  })
  it("still calls the action when Clerk can't give a token", async () => {
    const run = vi.fn(async () => ({ success: true }))
    await expect(callAction(run, { current: async () => { throw new Error("offline") }, renew: async () => {} })).resolves.toEqual({ success: true })
  })
})

describe("isSessionFailure", () => {
  it("reads only ended-session answers as session failures", () => {
    expect(isSessionFailure({ value: { error: "Describe the problem" } })).toBe(false)
    expect(isSessionFailure({ value: { success: false, error: { code: "validation", message: "x" } } })).toBe(false)
    expect(isSessionFailure({ value: null })).toBe(false)
    expect(isSessionFailure({ thrown: new Error("forbidden") })).toBe(true)
    expect(isSessionFailure({ value: { error: "Your session ended. Sign in again to continue." } })).toBe(true)
  })
})
