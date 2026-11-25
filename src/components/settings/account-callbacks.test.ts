import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { fakeAuthFetch, type AuthFetchFake } from "@/test/auth-fetch-fake"
import { accountCallbacks, deviceCallbacks } from "./account-callbacks"

// #394: the account section's calls, through Lane's real browser auth client with only the network faked. The Server
// Actions answer through the real route in src/app/(app)/settings/profile/account-actions.test.ts.
const actions = vi.hoisted(() => ({ setFirstPassword: vi.fn(), signOutDevice: vi.fn(), signOutOtherDevices: vi.fn() }))
vi.mock("@/app/(app)/settings/profile/account-actions", () => actions)
const switchWorkspace = vi.hoisted(() => vi.fn())
vi.mock("@/app/(app)/workspace-actions", () => ({ switchWorkspace }))

let network: AuthFetchFake
let refresh: ReturnType<typeof vi.fn<() => void>>
const callbacks = () => accountCallbacks({ orgId: "org_1", refresh })
beforeEach(() => {
  network = fakeAuthFetch()
  refresh = vi.fn()
  for (const action of [...Object.values(actions), switchWorkspace]) action.mockReset().mockResolvedValue({ ok: true })
})
afterEach(() => { vi.unstubAllGlobals() })

describe("Settings → Profile's account calls (#394)", () => {
  it("renames the signed-in person, then reads the page again so every place shows the new name", async () => {
    expect(await callbacks().onSaveName("Sam Rivera")).toMatchObject({ ok: true })
    expect(network.requests).toMatchObject([{ path: "/update-user", method: "POST", body: { name: "Sam Rivera" } }])
    expect(refresh).toHaveBeenCalledOnce()
  })

  it.each([true, false])("changes the password, signing out the other devices: %s", async (signOutOtherDevices) => {
    expect(await callbacks().onChangePassword({ currentPassword: "old-secret", newPassword: "new-secret-1", signOutOtherDevices })).toMatchObject({ ok: true })
    expect(network.requests).toMatchObject([{ path: "/change-password", body: { currentPassword: "old-secret", newPassword: "new-secret-1", revokeOtherSessions: signOutOtherDevices } }])
    expect(refresh).toHaveBeenCalledOnce()
  })

  // Signing out the other devices gives this one a new session, in no workspace.
  it("opens the page's workspace again before reading the page, when the other devices were signed out", async () => {
    const order: string[] = []
    switchWorkspace.mockImplementation(async (id: string) => { order.push(`switch ${id}`); return { ok: true } })
    refresh.mockImplementation(() => { order.push("refresh") })
    const change = (signOutOtherDevices: boolean) => callbacks().onChangePassword({ currentPassword: "old-secret", newPassword: "new-secret-1", signOutOtherDevices })
    await change(true)
    expect(order).toEqual(["switch org_1", "refresh"])
    await change(false)
    expect(order).toEqual(["switch org_1", "refresh", "refresh"])
    network.refuse("/change-password", 400, "INVALID_PASSWORD")
    await change(true)
    expect(order).toHaveLength(3)
  })

  it("still says the password changed when the workspace couldn't be opened again", async () => {
    for (const fail of [async () => ({ ok: false }), async () => { throw new TypeError("Failed to fetch") }]) {
      switchWorkspace.mockImplementation(fail)
      expect(await callbacks().onChangePassword({ currentPassword: "old-secret", newPassword: "new-secret-1", signOutOtherDevices: true })).toMatchObject({ ok: true })
    }
    expect(refresh).toHaveBeenCalledTimes(2)
  })

  it("sets a first password on the server, for the page's workspace", async () => {
    expect(await callbacks().onSetPassword("new-secret-1")).toEqual({ ok: true })
    expect(actions.setFirstPassword).toHaveBeenCalledWith("new-secret-1", { orgId: "org_1" })
    expect(network.requests).toEqual([])
    expect(refresh).toHaveBeenCalledOnce()
  })

  it("starts Google's connection, coming back to Settings → Profile either way", async () => {
    expect(await callbacks().onConnectGoogle()).toMatchObject({ ok: true })
    expect(network.requests).toMatchObject([{ path: "/link-social", body: { provider: "google", callbackURL: "/settings/profile", errorCallbackURL: "/settings/profile" } }])
    // The page is on its way to Google.
    expect(refresh).not.toHaveBeenCalled()
  })

  it("disconnects the Google account, and nothing when it's already gone", async () => {
    expect(await callbacks().onDisconnectGoogle()).toMatchObject({ ok: true })
    expect(network.to("/unlink-account")).toMatchObject([{ body: { accountId: "account_google" } }])
    expect(refresh).toHaveBeenCalledOnce()

    network.succeed("/list-accounts", [{ id: "account_password", providerId: "credential" }])
    expect(await callbacks().onDisconnectGoogle()).toMatchObject({ ok: true })
    expect(network.to("/unlink-account")).toHaveLength(1)
    expect(refresh).toHaveBeenCalledTimes(2)
  })

  it("answers a refusal's code, and reads nothing again", async () => {
    network.refuse("/update-user", 401, "UNAUTHORIZED").refuse("/change-password", 400, "INVALID_PASSWORD").refuse("/unlink-account", 403, "SESSION_NOT_FRESH").refuse("/link-social", 401, "UNAUTHORIZED")
    expect(await callbacks().onSaveName("Sam")).toEqual({ ok: false, code: "UNAUTHORIZED" })
    expect(await callbacks().onChangePassword({ currentPassword: "x", newPassword: "new-secret-1", signOutOtherDevices: true })).toEqual({ ok: false, code: "INVALID_PASSWORD" })
    expect(await callbacks().onDisconnectGoogle()).toEqual({ ok: false, code: "SESSION_NOT_FRESH" })
    expect(await callbacks().onConnectGoogle()).toEqual({ ok: false, code: "UNAUTHORIZED" })
    actions.setFirstPassword.mockResolvedValue({ ok: false, code: "PASSWORD_ALREADY_SET" })
    expect(await callbacks().onSetPassword("new-secret-1")).toEqual({ ok: false, code: "PASSWORD_ALREADY_SET" })
    network.refuse("/list-accounts", 401, "UNAUTHORIZED")
    expect(await callbacks().onDisconnectGoogle()).toEqual({ ok: false, code: "UNAUTHORIZED" })
    expect(refresh).not.toHaveBeenCalled()
  })

  it("answers a failure with no code when nothing reached the server", async () => {
    network.throwOn("/update-user")
    expect(await callbacks().onSaveName("Sam")).toEqual({ ok: false })
    expect(refresh).not.toHaveBeenCalled()
  })
})

describe("the signed-in devices' calls (#394)", () => {
  const device = { id: "session_2", browser: "Safari", system: "iPhone", signedInAt: "2026-11-18T09:00:00Z", lastUsedAt: "2026-11-22T07:00:00Z", current: false }

  it("signs out one device by its id, or all the others, for the page's workspace", async () => {
    const calls = deviceCallbacks({ orgId: "org_1", refresh })
    expect(await calls.onSignOutDevice(device)).toEqual({ ok: true })
    expect(actions.signOutDevice).toHaveBeenCalledWith("session_2", { orgId: "org_1" })
    expect(await calls.onSignOutOtherDevices()).toEqual({ ok: true })
    expect(actions.signOutOtherDevices).toHaveBeenCalledWith({ orgId: "org_1" })
    expect(refresh).not.toHaveBeenCalled()
  })

  it("reads the page again to load the list again", () => {
    deviceCallbacks({ orgId: "org_1", refresh }).onReloadDevices()
    expect(refresh).toHaveBeenCalledOnce()
  })
})
