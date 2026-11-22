import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { afterEach, beforeEach, describe, expect, expectTypeOf, it, vi } from "vitest"
import { withoutHidden } from "@/test/exposed-markup"
import { createSignedInDevices, type SignedInDevicesCallbacks } from "./profile-account-devices-controller"
import { ProfileAccountDevices, type ProfileAccountDevicesProps, type SignedInDevice } from "./profile-account-devices"

// The view makes its controller once per mount; the test hands it one it has already driven, as a person would.
vi.mock("./profile-account-devices-controller", async (importOriginal) => ({
  ...await importOriginal<typeof import("./profile-account-devices-controller")>(),
  createSignedInDevices: vi.fn(),
}))
const actual = await vi.importActual<typeof import("./profile-account-devices-controller")>("./profile-account-devices-controller")

const thisMac: SignedInDevice = { id: "s1", browser: "Chrome", system: "macOS", signedInAt: "2026-11-02T09:00:00Z", lastUsedAt: "2026-11-22T08:00:00Z", current: true }
const phone: SignedInDevice = { id: "s2", browser: "Safari", system: "iPhone", signedInAt: "2026-11-18T09:00:00Z", lastUsedAt: "2026-11-22T07:00:00Z", current: false }
const oldPc: SignedInDevice = { id: "s3", browser: "Firefox", system: "Windows", signedInAt: "2025-11-18T09:00:00Z", lastUsedAt: "2026-11-21T10:00:00Z", current: false }

const done = async () => ({ success: true as const })
let callbacks: { [K in keyof SignedInDevicesCallbacks]: ReturnType<typeof vi.fn<SignedInDevicesCallbacks[K]>> }

function mount(props: Partial<ProfileAccountDevicesProps> = {}) {
  const all: ProfileAccountDevicesProps = { devices: [thisMac, phone, oldPc], state: "ready", ...callbacks, ...props }
  const devices = actual.createSignedInDevices(all)
  vi.mocked(createSignedInDevices).mockReturnValue(devices)
  return { devices, render: () => renderToStaticMarkup(createElement(ProfileAccountDevices, all)) }
}
const render = (props: Partial<ProfileAccountDevicesProps> = {}) => mount(props).render()

const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()
/** Each device row's words, in order. */
const rows = (html: string) => [...html.matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/g)].map(([, row]) => text(withoutHidden(row)))
/** The opening tag of the button with this accessible name (its aria-label, or its words). */
function button(html: string, name: string) {
  for (const [, tag, inner] of html.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/g))
    if ((/aria-label="([^"]*)"/.exec(tag)?.[1] ?? text(withoutHidden(inner))) === name) return tag
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] })
  vi.setSystemTime(new Date("2026-11-22T12:00:00Z"))
  callbacks = { onSignOutDevice: vi.fn(done), onSignOutOtherDevices: vi.fn(done), onReloadDevices: vi.fn() }
})
afterEach(() => { vi.useRealTimers() })

describe("Settings → Profile, Signed-in devices (#380)", () => {
  it("lists each device as browser on system, when it was last used and when it signed in", () => {
    expect(rows(render())).toEqual([
      "Chrome on macOS Used today, signed in 2 Nov This device",
      "Safari on iPhone Used today, signed in 18 Nov Sign out",
      "Firefox on Windows Used yesterday, signed in 18 Nov 2025 Sign out",
    ])
  })

  it("marks this device, with no Sign out, and gives every other device its own", () => {
    const html = render()
    expect(button(html, "Sign out of Chrome on macOS")).toBeUndefined()
    expect(button(html, "Sign out of Safari on iPhone")).toBeDefined()
    expect(button(html, "Sign out of Firefox on Windows")).toBeDefined()
  })

  it("sends the device to sign out to the callback, then drops it from the list", async () => {
    const { devices, render } = mount()
    await devices.signOut(phone)
    expect(callbacks.onSignOutDevice).toHaveBeenCalledWith(phone)
    const html = render()
    expect(rows(html).map(row => row.split(" Used")[0])).toEqual(["Chrome on macOS", "Firefox on Windows"])
    expect(html).toMatch(/role="status"[^>]*>Signed out of Safari on iPhone\.</)
  })

  it("shows a refused sign-out on its row, with Try again", async () => {
    callbacks.onSignOutDevice.mockResolvedValueOnce({ error: "UNAUTHORIZED" })
    const { devices, render } = mount()
    await devices.signOut(oldPc)
    const [, iphone, firefox] = rows(render())
    expect(firefox).toContain("You’re signed out. Sign in, then try again. Try again")
    expect(iphone).not.toContain("Try again")
  })

  it("offers Sign out of all other devices only while another device is signed in", async () => {
    expect(button(render(), "Sign out of all other devices")).toBeDefined()
    expect(button(render({ devices: [thisMac] }), "Sign out of all other devices")).toBeUndefined()
    const { devices, render: again } = mount()
    await devices.signOutOthers()
    expect(callbacks.onSignOutOtherDevices).toHaveBeenCalledOnce()
    const html = again()
    expect(rows(html)).toEqual(["Chrome on macOS Used today, signed in 2 Nov This device"])
    expect(button(html, "Sign out of all other devices")).toBeUndefined()
  })

  it("says only you see the list and how long a device stays signed in, and shows no address or place", () => {
    const html = render()
    expect(text(html)).toContain("Only you see this. A device stays signed in for 7 days after it was last used.")
    expect(text(html)).not.toMatch(/\b\d{1,3}(\.\d{1,3}){3}\b|\bIP\b|location/i)
    // A device has no field for an IP address or a place, so the view can't show one.
    expectTypeOf<keyof SignedInDevice>().toEqualTypeOf<"id" | "browser" | "system" | "signedInAt" | "lastUsedAt" | "current">()
  })

  it("shows the Settings row failure with Try again when the list couldn't load, and Try again reloads it", () => {
    const { devices, render } = mount({ state: "error", devices: [] })
    const html = render()
    expect(html).toMatch(/role="alert"[\s\S]*Your devices couldn’t be loaded/)
    expect(button(html, "Try again")).toBeDefined()
    devices.reload()
    expect(callbacks.onReloadDevices).toHaveBeenCalledOnce()
  })
})
