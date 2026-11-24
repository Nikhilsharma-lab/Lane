import { afterEach, describe, expect, it, vi } from "vitest"
import { callAction, isSessionFailure } from "./action-call"
import { OfflineError } from "./offline-error"

afterEach(() => vi.unstubAllGlobals())
const expired = { error: "Wording may change", sessionExpired: true as const }

describe("callAction", () => {
  // #397: an ended session is answered, never sent again.
  it.each([expired, { success: false, error: { code: "session_expired", message: "Sign in again." } }])("sends an action once and returns its ended session unchanged", async failure => {
    const run = vi.fn(async () => failure)
    await expect(callAction(run)).resolves.toBe(failure)
    expect(run).toHaveBeenCalledTimes(1)
  })
  it.each(["Your session ended. Sign in again to continue.", "You can’t change Requests in this workspace.", "Describe the problem"])("returns an ordinary refusal unchanged: %s", async error => {
    const refusal = { error }; const run = vi.fn(async () => refusal)
    await expect(callAction(run)).resolves.toBe(refusal)
    expect(run).toHaveBeenCalledTimes(1)
  })
  it.each(["401 response lost after commit", "403 Forbidden", "Unauthorized", "Failed to fetch", "NEXT_REDIRECT"])("propagates ambiguous throws unchanged: %s", async message => {
    const failure = new Error(message); const run = vi.fn(async () => { throw failure })
    await expect(callAction(run)).rejects.toBe(failure)
    expect(run).toHaveBeenCalledTimes(1)
  })
  // #260: offline, nothing is sent or queued; the caller gets the shared offline answer.
  it("never calls the action while the browser is offline", async () => {
    vi.stubGlobal("navigator", { onLine: false })
    const run = vi.fn(async () => ({ success: true }))
    await expect(callAction(run)).rejects.toBeInstanceOf(OfflineError)
    expect(run).not.toHaveBeenCalled()
  })
})

describe("isSessionFailure", () => {
  it("recognizes only explicit result signals", () => {
    expect(isSessionFailure({ value: expired })).toBe(true)
    expect(isSessionFailure({ value: { success: false, error: { code: "session_expired", message: "changed" } } })).toBe(true)
    for (const value of [null, { error: "Your session ended" }, { error: "Describe the problem" }, { error: { code: "validation" } }, { sessionExpired: false, error: "x" }, { sessionExpired: true, moved: ["id"] }]) expect(isSessionFailure({ value })).toBe(false)
    expect(isSessionFailure({ thrown: new Error("forbidden") })).toBe(false)
  })
})
