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
