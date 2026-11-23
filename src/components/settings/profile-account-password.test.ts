import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { Dialog } from "@/components/popup/adaptive-dialog"
import { createProfileAccount, type ProfileAccountCallbacks } from "./profile-account-controller"
import { ProfileAccountPasswordForm } from "./profile-account-password"

const done = async () => ({ ok: true as const })
let callbacks: { onChangePassword: ReturnType<typeof vi.fn<ProfileAccountCallbacks["onChangePassword"]>>; onSetPassword: ReturnType<typeof vi.fn<ProfileAccountCallbacks["onSetPassword"]>> }
let account: ReturnType<typeof createProfileAccount>

beforeEach(() => {
  callbacks = { onChangePassword: vi.fn(done), onSetPassword: vi.fn(done) }
  account = createProfileAccount({ name: "Sam Lee", onSaveName: done, onConnectGoogle: done, onDisconnectGoogle: done, ...callbacks })
})

// Dialog content never renders in static markup (Radix's portal waits for the browser), so the form renders inside
// the dialog's context on its own, as the invite form's test does.
const render = (mode: "change" | "set") => renderToStaticMarkup(createElement(Dialog, null, createElement(ProfileAccountPasswordForm, { account, mode })))
const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()
/** The input with this autocomplete name. */
const input = (html: string, autoComplete: string) => new RegExp(`<input[^>]*autoComplete="${autoComplete}"[^>]*>`).exec(html)?.[0]
/** The words tied to the input with this autocomplete name by aria-describedby. */
function described(html: string, autoComplete: string) {
  const ids = /aria-describedby="([^"]+)"/.exec(input(html, autoComplete) ?? "")?.[1]?.split(" ") ?? []
  return ids.map(id => text(new RegExp(`<[^>]*id="${id}"[^>]*>([\\s\\S]*?)</`).exec(html)?.[1] ?? "")).join(" ")
}
const checkbox = (html: string) => /<button[^>]*role="checkbox"[^>]*>/.exec(html)?.[0]

async function change(current: string, next: string) {
  account.openPassword("change")
  account.changeCurrentPassword(current)
  account.changeNewPassword(next)
  await account.submitPassword()
}

describe("Settings → Profile, Change password (#380)", () => {
  it("asks for the current and the new password, named for password managers", () => {
    account.openPassword("change")
    const html = render("change")
    expect(input(html, "current-password")).toMatch(/type="password"/)
    expect(input(html, "new-password")).toMatch(/type="password"/)
    expect(html).toContain(">Current password<")
    expect(html).toContain(">New password<")
    expect(text(html)).toContain("Change password")
  })

  it("ticks Sign out of my other devices by default", () => {
    account.openPassword("change")
    const html = render("change")
    expect(html).toContain(">Sign out of my other devices<")
    expect(checkbox(html)).toMatch(/aria-checked="true"/)
  })

  it("sends the current and new password, and whether to sign out of the other devices, ticked or not", async () => {
    await change("old-secret", "new-secret-1")
    expect(callbacks.onChangePassword).toHaveBeenLastCalledWith({ currentPassword: "old-secret", newPassword: "new-secret-1", signOutOtherDevices: true })
    account.openPassword("change")
    account.setSignOutOthers(false)
    expect(checkbox(render("change"))).toMatch(/aria-checked="false"/)
    account.changeCurrentPassword("old-secret")
    account.changeNewPassword("new-secret-2")
    await account.submitPassword()
    expect(callbacks.onChangePassword).toHaveBeenLastCalledWith({ currentPassword: "old-secret", newPassword: "new-secret-2", signOutOtherDevices: false })
  })

  it("puts a wrong current password's line on the current password", async () => {
    callbacks.onChangePassword.mockResolvedValue({ ok: false as const, code: "INVALID_PASSWORD" })
    await change("wrong", "new-secret-1")
    const html = render("change")
    expect(described(html, "current-password")).toContain("That isn’t your current password.")
    expect(input(html, "current-password")).toMatch(/aria-invalid="true"/)
    expect(described(html, "new-password")).not.toContain("That isn’t")
  })

  it.each([
    ["PASSWORD_COMPROMISED", "This password has appeared in a data breach elsewhere. Choose a different one."],
    ["PASSWORD_TOO_SHORT", "Use at least 8 characters."],
    ["PASSWORD_CHECK_UNAVAILABLE", "We couldn’t check this password right now. Try again in a minute."],
  ])("puts %s's line on the new password", async (code, line) => {
    callbacks.onChangePassword.mockResolvedValue({ ok: false as const, code })
    await change("old-secret", "short")
    const html = render("change")
    expect(described(html, "new-password")).toContain(line)
    expect(input(html, "new-password")).toMatch(/aria-invalid="true"/)
    expect(input(html, "current-password")).not.toMatch(/aria-invalid="true"/)
  })

  it("shows any other refusal above the buttons", async () => {
    callbacks.onChangePassword.mockRejectedValue(new TypeError("Failed to fetch"))
    await change("old-secret", "new-secret-1")
    expect(render("change")).toMatch(/role="alert"[\s\S]*Something went wrong\. Try again\./)
  })

  it("refuses empty fields in Lane's words, not the browser's, and sends nothing", async () => {
    account.openPassword("change")
    const field = await account.submitPassword()
    expect(field).toBe("current")
    const html = render("change")
    expect(html).toMatch(/<form[^>]*noValidate=""/)
    expect(described(html, "current-password")).toContain("Enter your current password.")
    expect(described(html, "new-password")).toContain("Enter a new password.")
    expect(callbacks.onChangePassword).not.toHaveBeenCalled()
  })

  it("keeps neither password once the change is saved", async () => {
    await change("old-secret", "new-secret-1")
    expect(account.snapshot().password.open).toBe(false)
    expect(JSON.stringify(account.snapshot())).not.toMatch(/old-secret|new-secret-1/)
    expect(account.snapshot().status).toBe("Password changed. Your other devices are signed out.")
  })
})

describe("Settings → Profile, Set a password (#380)", () => {
  it("asks only for a new password, with no sign-out choice", () => {
    account.openPassword("set")
    const html = render("set")
    expect(input(html, "new-password")).toBeDefined()
    expect(input(html, "current-password")).toBeUndefined()
    expect(checkbox(html)).toBeUndefined()
    expect(html).not.toContain("Sign out of my other devices")
    expect(text(html)).toContain("Set password")
  })

  it("sends the new password to the set callback, and puts a refusal on the field", async () => {
    account.openPassword("set")
    account.changeNewPassword("new-secret-1")
    await account.submitPassword()
    expect(callbacks.onSetPassword).toHaveBeenCalledWith("new-secret-1")
    expect(callbacks.onChangePassword).not.toHaveBeenCalled()
    callbacks.onSetPassword.mockResolvedValue({ ok: false as const, code: "PASSWORD_COMPROMISED" })
    account.openPassword("set")
    account.changeNewPassword("password1")
    expect(await account.submitPassword()).toBe("new")
    expect(described(render("set"), "new-password")).toContain("This password has appeared in a data breach elsewhere.")
  })
})
