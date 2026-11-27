/**
 * #394: Settings → Profile's account section as the server draws it, for people made through the real auth route, with
 * their methods and devices read from the local test database as their own request.
 */
import { createElement, lazy, Suspense, type ComponentType, type ReactNode } from "react"
import { renderToReadableStream } from "react-dom/server"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { AuthBrowser, authRouteTestFile, fakeOutbound, signInWithGoogle, switchOnAuthRoute, type Outbound } from "@/test/auth-route-browser"

// Next's dynamic() as the app's build has it: the code in its own chunk, drawn on the server too.
vi.mock("next/dynamic", () => ({
  default: (load: () => Promise<ComponentType>, { loading }: { loading: () => ReactNode }) => {
    const Code = lazy(async () => ({ default: await load() }))
    return function Dynamic(props: object) { return createElement(Suspense, { fallback: loading() }, createElement(Code, props)) }
  },
}))
vi.mock("@/components/shell/stable-router", () => ({ useStableRouter: () => ({ refresh: () => {} }) }))
const devicesRead = vi.hoisted(() => ({ instead: null as null | (() => Promise<never>) }))
vi.mock("@/lib/session", async (original) => {
  const seam = await original<typeof import("@/lib/session")>()
  return { ...seam, readSignedInDevices: () => (devicesRead.instead ?? seam.readSignedInDevices)() }
})

import { accountPanels } from "./account-panels"
import ProfilePage from "./page"

const { connection, person, signedIn, createWorkspace } = authRouteTestFile("account-panels.test")
let outbound: Outbound
beforeEach(() => {
  switchOnAuthRoute()
  outbound = fakeOutbound()
  devicesRead.instead = null
})

type Person = { userId: string; person: { name: string; email: string }; browser: AuthBrowser }
const workspaceOf = ({ userId, person: { name, email } }: Person) => ({ orgId: "org_account_panels", userId, fullName: name, email })
const googleAccount = ({ email, name }: { email: string; name: string }) => ({ sub: `google-${email}`, email, email_verified: true, name })

async function googleOnly(label: string): Promise<Person> {
  const someone = person(label)
  const browser = new AuthBrowser()
  await signInWithGoogle(browser, outbound, googleAccount(someone))
  const [{ id }] = await connection`select id from profiles where email = ${someone.email}`
  return { userId: id as string, person: someone, browser }
}

/** The stream of the panels, drawn as this person's request. */
async function stream(who: Person, googleError?: string) {
  const panels = await accountPanels(workspaceOf(who), googleError)
  return renderToReadableStream(createElement("main", null, panels.account, panels.devices, panels.security))
}
/** Everything the server sends for them. */
const draw = (who: Person, googleError?: string) => who.browser.action(async () => new Response(await stream(who, googleError)).text())

const text = (html: string) => html.replace(/<(script|style)\b[\s\S]*?<\/\1>/g, " ").replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/\s+/g, " ").trim()
const button = (html: string, label: string) => [...html.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/g)].find(([, , inner]) => text(inner) === label)?.[1]
const disabled = (tag: string | undefined) => /\bdisabled=""/.test(tag ?? "")

describe("Settings → Profile's account rows", () => {
  it("for password only: the name, the email, Change password and Connect Google", async () => {
    const who = await signedIn(outbound, "password")
    const html = await draw(who)
    expect(html).toContain(`value="${who.person.name}"`)
    expect(text(html)).toContain(who.person.email)
    expect(button(html, "Change password")).toBeDefined()
    expect(button(html, "Connect Google")).toBeDefined()
    expect([button(html, "Set a password"), button(html, "Disconnect")]).toEqual([undefined, undefined])
  })

  it("for Google only: Set a password, and Disconnect greyed with its reason", async () => {
    const html = await draw(await googleOnly("google"))
    expect(button(html, "Set a password")).toBeDefined()
    expect(disabled(button(html, "Disconnect"))).toBe(true)
    expect(text(html)).toContain("Google is your only sign-in method. Set a password before disconnecting it.")
    expect([button(html, "Change password"), button(html, "Connect Google")]).toEqual([undefined, undefined])
  })

  it("for both: Change password and Disconnect", async () => {
    const who = await signedIn(outbound, "both")
    await signInWithGoogle(new AuthBrowser(), outbound, googleAccount(who.person))
    const html = await draw(who)
    expect(button(html, "Change password")).toBeDefined()
    expect(button(html, "Disconnect")).toBeDefined()
    expect(disabled(button(html, "Disconnect"))).toBe(false)
  })

  it("say why connecting Google changed nothing, and keep AI data use", async () => {
    const who = await signedIn(outbound, "google-error")
    expect(text(await draw(who, "email_does_not_match"))).toContain("That Google account uses a different email, so nothing changed.")
    const html = await draw(who)
    expect(text(html)).not.toContain("nothing changed")
    expect(html).toContain('id="ai-data"')
  })
})

describe("Settings → Profile's signed-in devices", () => {
  it("lists the person's devices with no session token, address or place", async () => {
    const who = await signedIn(outbound, "devices")
    const phone = new AuthBrowser()
    await phone.post("/sign-in/email", who.person, { "user-agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1" })
    const html = await draw(who)
    expect(text(html)).toMatch(/Unknown browser on unknown system Used today, signed in today This device Safari on iPhone Used today, signed in today Sign out/)
    const sessions = await connection`select token, ip_address from session where user_id = ${who.userId}`
    expect(sessions).toHaveLength(2)
    for (const { token, ip_address } of sessions) {
      expect(html).not.toContain(token)
      expect(ip_address).toBeTruthy()
      expect(html).not.toContain(ip_address)
    }
  })

  it("don't hold up the rest of the section", async () => {
    const who = await signedIn(outbound, "waiting")
    devicesRead.instead = () => new Promise(() => {})
    await who.browser.action(async () => {
      const reader = (await stream(who)).getReader()
      let html = ""
      // The account's code arrives in its own chunk; the devices never do.
      while (!html.includes("Change password") || !html.includes("Loading devices")) html += new TextDecoder().decode((await reader.read()).value)
      expect(html).not.toContain("This device")
      await reader.cancel()
    })
  })

  it("say they couldn't be loaded, with a reload, when the read fails, and leave the rest as it is", async () => {
    const who = await signedIn(outbound, "failing")
    devicesRead.instead = () => Promise.reject(new Error("the database is away"))
    const logged = vi.spyOn(console, "error").mockImplementation(() => {})
    const html = await draw(who)
    expect(text(html)).toContain("Your devices couldn’t be loaded")
    expect(button(html, "Try again")).toBeDefined()
    expect(button(html, "Change password")).toBeDefined()
    expect(JSON.stringify(logged.mock.calls)).not.toContain("the database is away")
  })
})

describe("the Profile page", () => {
  it("hands Google's error in its address to the account section", async () => {
    const who = await signedIn(outbound, "page")
    await createWorkspace(who.browser)
    const html = await who.browser.action(async () => {
      const page = await ProfilePage({ searchParams: Promise.resolve({ error: "access_denied" }) })
      const [settings] = (page.props as { children: { props: { account: ReactNode } }[] }).children
      return new Response(await renderToReadableStream(createElement("main", null, settings.props.account))).text()
    })
    expect(text(html)).toContain("Google didn’t connect, so nothing changed. Try again.")
  })
})
