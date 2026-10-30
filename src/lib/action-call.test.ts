import { afterEach, describe, expect, it, vi } from "vitest"
import { callAction, isSessionFailure, type ActionSession } from "./action-call"
import { OfflineError } from "./offline-error"

const session = (): ActionSession & { order: string[] } => {
  const order: string[] = []
  return { order, current: vi.fn(async () => { order.push("current"); return "current" }), renew: vi.fn(async () => { order.push("renew"); return "renewed" }) }
}
afterEach(() => vi.unstubAllGlobals())
const expired = { error: "Wording may change", sessionExpired: true as const }

describe("callAction", () => {
  it("asks for a current token before the first attempt", async () => {
    const s = session()
    const run = vi.fn(async () => { s.order.push("run"); return { error: "Not found" } })
    await expect(callAction(run, s)).resolves.toEqual({ error: "Not found" })
    expect(s.order).toEqual(["current", "run"])
  })
  it("retries an explicit pre-write expiry once regardless of display copy", async () => {
    const s = session()
    const run = vi.fn().mockResolvedValueOnce(expired).mockResolvedValueOnce({ success: true })
    await expect(callAction(run, s)).resolves.toEqual({ success: true })
    expect(run).toHaveBeenCalledTimes(2)
    expect(s.renew).toHaveBeenCalledTimes(1)
  })
  it.each([expired, { success: false, error: { code: "session_expired", message: "Sign in again." } }])("returns repeated expiry unchanged after one replay", async failure => {
    const s = session()
    const run = vi.fn(async () => failure)
    await expect(callAction(run, s)).resolves.toBe(failure)
    expect(run).toHaveBeenCalledTimes(2)
    expect(s.renew).toHaveBeenCalledTimes(1)
  })
  it.each([null, undefined, "", "   ", false])("keeps the first failure when renewal returns %s", async token => {
    const s = session(); s.renew = vi.fn(async () => token)
    const run = vi.fn(async () => expired)
    await expect(callAction(run, s)).resolves.toBe(expired)
    expect(run).toHaveBeenCalledTimes(1)
  })
  it("keeps the first failure when renewal rejects", async () => {
    const s = session(); s.renew = vi.fn(async () => { throw new Error("offline") })
    const run = vi.fn(async () => expired)
    await expect(callAction(run, s)).resolves.toBe(expired)
    expect(run).toHaveBeenCalledTimes(1)
  })
  it.each(["Your session ended. Sign in again to continue.", "You can't change Requests in this workspace.", "Describe the problem"])("never replays ordinary refusal: %s", async error => {
    const s = session(); const refusal = { error }; const run = vi.fn(async () => refusal)
    await expect(callAction(run, s)).resolves.toBe(refusal)
    expect(run).toHaveBeenCalledTimes(1)
    expect(s.renew).not.toHaveBeenCalled()
  })
  it.each(["401 response lost after commit", "403 Forbidden", "Unauthorized", "Failed to fetch", "NEXT_REDIRECT"])("propagates ambiguous throws unchanged: %s", async message => {
    const s = session(); const failure = new Error(message); const run = vi.fn(async () => { throw failure })
    await expect(callAction(run, s)).rejects.toBe(failure)
    expect(run).toHaveBeenCalledTimes(1)
    expect(s.renew).not.toHaveBeenCalled()
  })
  // #260: offline, nothing is sent or queued; the caller gets the shared offline answer.
  it("never calls the action while the browser is offline", async () => {
    vi.stubGlobal("navigator", { onLine: false })
    try {
      const s = session()
      const run = vi.fn(async () => ({ success: true }))
      await expect(callAction(run, s)).rejects.toBeInstanceOf(OfflineError)
      expect(run).not.toHaveBeenCalled()
      expect(s.current).not.toHaveBeenCalled()
    } finally {
      vi.unstubAllGlobals()
    }
  })
  it("still calls the action when current-token lookup fails", async () => {
    const run = vi.fn(async () => ({ success: true }))
    await expect(callAction(run, { current: async () => { throw new Error("offline") }, renew: async () => undefined })).resolves.toEqual({ success: true })
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

describe("production Clerk session adapter", () => {
  it("requests uncached renewal only after explicit expiry", async () => {
    const getToken = vi.fn().mockResolvedValueOnce("cached").mockResolvedValueOnce("renewed")
    vi.stubGlobal("Clerk", { session: { getToken } })
    const run = vi.fn().mockResolvedValueOnce(expired).mockResolvedValueOnce({ success: true })
    await expect(callAction(run)).resolves.toEqual({ success: true })
    expect(getToken.mock.calls).toEqual([[], [{ skipCache: true }]])
    expect(run).toHaveBeenCalledTimes(2)
  })
  it.each([undefined, { session: null }, { session: { getToken: async () => null } }])("does not replay without a usable Clerk session", async clerk => {
    vi.stubGlobal("Clerk", clerk)
    const run = vi.fn(async () => expired)
    await expect(callAction(run)).resolves.toBe(expired)
    expect(run).toHaveBeenCalledTimes(1)
  })
})
