import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { withoutHidden } from "@/test/exposed-markup"
import { createProfileAccount, type ProfileAccountCallbacks } from "./profile-account-controller"
import { ProfileAccountView, type ProfileAccountViewProps } from "./profile-account-view"

// The view makes its controller once per mount; the test hands it one it has already driven, as a person would.
vi.mock("./profile-account-controller", async (importOriginal) => ({
  ...await importOriginal<typeof import("./profile-account-controller")>(),
  createProfileAccount: vi.fn(),
}))
const actual = await vi.importActual<typeof import("./profile-account-controller")>("./profile-account-controller")

const done = async () => ({ success: true as const })
let callbacks: { [K in keyof ProfileAccountCallbacks]: ReturnType<typeof vi.fn<ProfileAccountCallbacks[K]>> }
const base = (): ProfileAccountViewProps => ({
  name: "Sam Lee", email: "sam@acme.test", methods: { password: true, google: true }, googleEmail: "sam@acme.test", ...callbacks,
})

/** Mounts the view with its controller made from these props, and returns that controller to drive. */
function mount(props: Partial<ProfileAccountViewProps> = {}) {
  const all = { ...base(), ...props }
  const account = actual.createProfileAccount(all, () => all)
  vi.mocked(createProfileAccount).mockReturnValue(account)
  return { account, render: () => renderToStaticMarkup(createElement(ProfileAccountView, all)) }
}
const render = (props: Partial<ProfileAccountViewProps> = {}) => mount(props).render()

const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()
/** The opening tag of the button whose words are `label`, or undefined. */
function button(html: string, label: string) {
  for (const [, tag, inner] of html.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/g)) if (text(withoutHidden(inner)) === label) return tag
}
const disabled = (tag: string | undefined) => /\bdisabled=""/.test(tag ?? "")

beforeEach(() => {
  callbacks = {
    onSaveName: vi.fn(done), onChangePassword: vi.fn(done), onSetPassword: vi.fn(done),
    onConnectGoogle: vi.fn(done), onDisconnectGoogle: vi.fn(done),
  }
})

describe("Settings → Profile, Account (#380)", () => {
  it("disables Save while the name is unchanged, and while it's empty", () => {
    const { account, render } = mount()
    expect(render()).toContain('value="Sam Lee"')
    expect(disabled(button(render(), "Save"))).toBe(true)
    account.changeName("   ")
    expect(disabled(button(render(), "Save"))).toBe(true)
    account.changeName("Sam Rivera")
    expect(button(render(), "Save")).toBeDefined()
    expect(disabled(button(render(), "Save"))).toBe(false)
  })

  it("sends a changed name to the save callback, and then Save waits for the next change", async () => {
    const { account, render } = mount()
    account.changeName("  Sam Rivera ")
    await account.saveName()
    expect(callbacks.onSaveName).toHaveBeenCalledWith("Sam Rivera")
    const html = render()
    expect(disabled(button(html, "Save"))).toBe(true)
    expect(html).toMatch(/role="status"[^>]*>Name saved\.</)
  })

  it("shows a refused save's line on the name field", async () => {
    callbacks.onSaveName.mockResolvedValue({ error: "UNAUTHORIZED" })
    const { account, render } = mount()
    account.changeName("Sam Rivera")
    await account.saveName()
    const html = render()
    expect(html).toMatch(/<input[^>]*aria-invalid="true"[^>]*value="Sam Rivera"|<input[^>]*value="Sam Rivera"[^>]*aria-invalid="true"/)
    expect(text(html)).toContain("You’re signed out. Sign in, then try again.")
  })

  it("names the name field for password managers and refuses an empty one in Lane's words", async () => {
    const { account, render } = mount()
    expect(render()).toMatch(/<input[^>]*autoComplete="name"/)
    expect(render()).toMatch(/<form[^>]*noValidate=""/)
    account.changeName("")
    await account.saveName()
    expect(callbacks.onSaveName).not.toHaveBeenCalled()
    expect(text(render())).toContain("Enter your name.")
  })

  it("shows the email read-only, saying it can't be changed yet", () => {
    const html = render()
    expect(text(html)).toContain("sam@acme.test")
    expect(text(html)).toContain("Changing your email isn’t available yet.")
    expect(html).not.toMatch(/<input[^>]*type="email"/)
    expect(html).not.toMatch(/<input[^>]*value="sam@acme.test"/)
  })
})

describe("Settings → Profile, Sign-in methods (#380)", () => {
  it("offers Change password to someone with a password, and Set a password to someone who signs in only with Google", () => {
    const withPassword = render()
    expect(button(withPassword, "Change password")).toBeDefined()
    expect(button(withPassword, "Set a password")).toBeUndefined()
    const googleOnly = render({ methods: { password: false, google: true } })
    expect(button(googleOnly, "Set a password")).toBeDefined()
    expect(button(googleOnly, "Change password")).toBeUndefined()
    expect(text(googleOnly)).toContain("You sign in with Google. Add a password to sign in without it.")
  })

  it("shows the connected Google account with Disconnect, or Connect Google without one", () => {
    const connected = render({ googleEmail: "sam.lee@gmail.test" })
    expect(text(connected)).toContain("Connected as sam.lee@gmail.test.")
    expect(disabled(button(connected, "Disconnect"))).toBe(false)
    expect(button(connected, "Connect Google")).toBeUndefined()
    const notConnected = render({ methods: { password: true, google: false }, googleEmail: undefined })
    expect(button(notConnected, "Connect Google")).toBeDefined()
    expect(button(notConnected, "Disconnect")).toBeUndefined()
    expect(text(notConnected)).not.toContain("Connected as")
  })

  it("sends Connect Google and Disconnect to their callbacks", async () => {
    const { account, render } = mount()
    await account.disconnectGoogle()
    expect(callbacks.onDisconnectGoogle).toHaveBeenCalledOnce()
    expect(render()).toMatch(/role="status"[^>]*>Google disconnected\.</)
    await account.connectGoogle()
    expect(callbacks.onConnectGoogle).toHaveBeenCalledOnce()
  })

  it("greys Disconnect while Google is the only sign-in method, and says why", () => {
    const html = render({ methods: { password: false, google: true } })
    const disconnect = button(html, "Disconnect")
    expect(disabled(disconnect)).toBe(true)
    const reason = /aria-describedby="([^"]+)"/.exec(disconnect ?? "")?.[1]
    expect(reason).toBeTruthy()
    expect(html).toMatch(new RegExp(`id="${reason}"[^>]*>Google is your only sign-in method\\. Set a password before disconnecting it\\.<`))
  })

  it("shows the same line when the server refuses to disconnect the last sign-in method", async () => {
    callbacks.onDisconnectGoogle.mockResolvedValue({ error: "FAILED_TO_UNLINK_LAST_ACCOUNT" })
    const { account, render } = mount()
    await account.disconnectGoogle()
    const html = render()
    expect(text(html)).toContain("Google is your only sign-in method. Set a password before disconnecting it.")
    // Trying again can't help, so there's no Try again.
    expect(button(html, "Try again")).toBeUndefined()
  })

  it("offers Try again on any other refused Google change", async () => {
    callbacks.onConnectGoogle.mockResolvedValueOnce({ error: "UNAUTHORIZED" })
    const { account, render } = mount({ methods: { password: true, google: false } })
    await account.connectGoogle()
    const html = render()
    expect(text(html)).toContain("You’re signed out. Sign in, then try again.")
    expect(button(html, "Try again")).toBeDefined()
  })

  it("says nothing changed when Google comes back from a connection with a different email, or one that didn't finish", () => {
    const different = render({ methods: { password: true, google: false }, googleError: "email_does_not_match" })
    expect(text(different)).toContain("That Google account uses a different email, so nothing changed. Choose the Google account that uses your Lane email.")
    for (const error of ["access_denied", "state_mismatch", "account_already_linked_to_different_user"]) {
      const unfinished = render({ methods: { password: true, google: false }, googleError: error })
      expect(text(unfinished)).toContain("Google didn’t connect, so nothing changed. Try again.")
      expect(text(unfinished)).not.toContain("use your email")
    }
    expect(text(render())).not.toContain("nothing changed")
  })
})
