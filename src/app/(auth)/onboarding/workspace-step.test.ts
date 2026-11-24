/**
 * #391: the workspace step's calls, as the browser makes them. `fetch` to /api/auth is faked, and the two Server
 * Actions answer as onboarding.test.ts shows they do.
 */
import { readFileSync } from "node:fs"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { rememberLastUsed } from "@/app/(app)/workspace-actions"
import { fakeAuthFetch, type AuthFetchFake } from "@/test/auth-fetch-fake"
import { createWorkspace } from "./actions"
import { createThenGo, joinThenGo } from "./workspace-step"

vi.mock("@/app/(app)/workspace-actions", () => ({ rememberLastUsed: vi.fn() }))
vi.mock("./actions", () => ({ createWorkspace: vi.fn() }))

let auth: AuthFetchFake
const go = vi.fn()
beforeEach(() => {
  auth = fakeAuthFetch()
  vi.mocked(rememberLastUsed).mockReset()
  vi.mocked(createWorkspace).mockReset()
  go.mockReset()
})
afterEach(() => vi.unstubAllGlobals())

const FIRST = { ok: true, data: { first: true } } as const
const ANOTHER = { ok: true, data: { first: false } } as const

describe("Join", () => {
  it.each([["the role step after a first workspace", FIRST, "/onboarding?step=role"], ["/ after another", ANOTHER, "/"]])("accepts the invitation, remembers the workspace, then goes to %s", async (_where, answer, address) => {
    vi.mocked(rememberLastUsed).mockImplementation(async () => {
      expect(auth.to("/organization/accept-invitation")).toHaveLength(1)
      return answer
    })
    expect(await joinThenGo("inv_1", go)).toMatchObject({ ok: true })
    expect(auth.requests.map(({ path, body }) => [path, body])).toEqual([["/organization/accept-invitation", { invitationId: "inv_1" }]])
    expect(go.mock.calls).toEqual([[address]])
  })

  it("goes nowhere and remembers nothing when it was refused", async () => {
    auth.refuse("/organization/accept-invitation", 403, "ORGANIZATION_MEMBERSHIP_LIMIT_REACHED")
    expect(await joinThenGo("inv_1", go)).toEqual({ ok: false, code: "ORGANIZATION_MEMBERSHIP_LIMIT_REACHED" })
    expect(rememberLastUsed).not.toHaveBeenCalled()
    expect(go).not.toHaveBeenCalled()
  })

  it("goes to / when the joined workspace couldn't be remembered", async () => {
    vi.mocked(rememberLastUsed).mockRejectedValueOnce(new TypeError("Failed to fetch"))
    expect(await joinThenGo("inv_1", go)).toMatchObject({ ok: true })
    expect(go.mock.calls).toEqual([["/"]])
  })
})

describe("Create workspace", () => {
  it.each([["the role step after a first workspace", FIRST, "/onboarding?step=role"], ["/ after another", ANOTHER, "/"]])("goes to %s", async (_where, answer, address) => {
    vi.mocked(createWorkspace).mockResolvedValueOnce(answer)
    expect(await createThenGo("Acme Design", go)).toEqual(answer)
    expect(vi.mocked(createWorkspace).mock.calls).toEqual([["Acme Design"]])
    expect(go.mock.calls).toEqual([[address]])
  })

  it("goes nowhere when it was refused", async () => {
    vi.mocked(createWorkspace).mockResolvedValueOnce({ ok: false, code: "UNAUTHORIZED" })
    expect(await createThenGo("Acme Design", go)).toEqual({ ok: false, code: "UNAUTHORIZED" })
    expect(go).not.toHaveBeenCalled()
  })
})

// The repo has no DOM to run effects in, so this reads the source.
it("has a role step that takes its marker off the address once it opens", () => {
  expect(readFileSync("src/app/(auth)/onboarding/role-form.tsx", "utf8")).toContain('useEffect(() => window.history.replaceState(window.history.state, "", ONBOARDING_URL), [])')
})
