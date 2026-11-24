/**
 * #388 (spec #383 "Signed-out screens"): /login, /signup, /forgot-password and /reset-password, opened with a query and
 * read as markup. The session is faked at the seam's read; the pages and the forms they mount are real.
 */
import type { Metadata } from "next"
import { createElement, type ReactNode } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { AuthPageQuery } from "@/components/auth/better-auth/auth-addresses"
import type { Session } from "@/lib/session"
import { BETTER_AUTH_MESSAGE, TEST_SITE_KEY } from "@/test/auth-fetch-fake"
import { buttonsIn, markupWords, withoutHidden } from "@/test/exposed-markup"

const visit = vi.hoisted(() => ({ session: null as Session | null }))
vi.mock("@/lib/session", () => ({ readSession: async () => visit.session }))

type Page = { default: (props: { searchParams: Promise<AuthPageQuery> }) => Promise<ReactNode>; metadata: Metadata }
const PAGES = {
  "/login": async () => (await import("./login/page")) as Page,
  "/signup": async () => (await import("./signup/page")) as Page,
  "/forgot-password": async () => (await import("./forgot-password/page")) as Page,
  "/reset-password": async () => (await import("./reset-password/page")) as Page,
}
type Address = keyof typeof PAGES
const ADDRESSES = Object.keys(PAGES) as Address[]

const MEI = "mei@example.test"
const GOOGLE_LINE = "Google sign-in didn’t finish. Try again, or use your email."
const rendered: string[] = []

async function open(address: Address, query: AuthPageQuery = {}) {
  const page = await PAGES[address]()
  const html = renderToStaticMarkup(createElement("div", null, await page.default({ searchParams: Promise.resolve(query) }))).replace(/<!--.*?-->/g, "")
  rendered.push(html)
  return html
}

/** Where opening it redirects to, or null when it renders. */
async function redirectOf(address: Address, query: AuthPageQuery = {}) {
  try {
    await open(address, query)
    return null
  } catch (error) {
    const digest = (error as { digest?: string }).digest
    if (!digest?.startsWith("NEXT_REDIRECT;")) throw error
    return digest.split(";")[2]
  }
}

const input = (html: string, id: string) => new RegExp(`<input[^>]*id="${id}"[^>]*>`).exec(html)?.[0] ?? ""
const links = (html: string) => [...html.matchAll(/<a\b[^>]*href="([^"]*)"[^>]*>(.*?)<\/a>/g)].map(([, href, inner]) => [markupWords(withoutHidden(inner)), href.replaceAll("&amp;", "&")])
const submits = (html: string) => buttonsIn(html).filter((button) => button.submit).map((button) => button.name)

beforeEach(() => {
  visit.session = null
  vi.stubEnv("NEXT_PUBLIC_TURNSTILE_SITE_KEY", TEST_SITE_KEY)
})
afterEach(() => vi.unstubAllEnvs())

describe("/login", () => {
  it("shows Lane's sign-in form with its fields and links", async () => {
    const html = await open("/login")
    expect(html).toMatch(/<h1[^>]*>Sign in to Lane<\/h1>/)
    expect(input(html, "sign-in-email")).toContain('value=""')
    expect(input(html, "sign-in-password")).toContain('autoComplete="current-password"')
    expect(buttonsIn(html).map((button) => button.name)).toEqual(expect.arrayContaining(["Continue with Google", "Sign in", "Email me a sign-in code instead"]))
    expect(submits(html)).toEqual(["Sign in"])
    expect(links(html)).toEqual(expect.arrayContaining([["Forgot password?", "/forgot-password"], ["Create an account", "/signup"]]))
    expect(html).not.toContain('role="alert"')
  })

  it("fills in the email, and keeps it and the return address on Create an account", async () => {
    const html = await open("/login", { email: MEI, redirect_url: "/requests/r1?view=board" })
    expect(input(html, "sign-in-email")).toContain(`value="${MEI}"`)
    expect(links(html)).toContainEqual(["Create an account", "/signup?email=mei%40example.test&redirect_url=%2Frequests%2Fr1%3Fview%3Dboard"])
  })

  it("opens at the code request with ?start=code-request", async () => {
    const html = await open("/login", { email: MEI, start: "code-request" })
    expect(html).toMatch(/<h1[^>]*>Sign in with a code<\/h1>/)
    expect(input(html, "sign-in-email")).toContain(`value="${MEI}"`)
    expect(input(html, "sign-in-password")).toBe("")
  })

  it.each(["password", "code", "CODE-REQUEST", "code-request ", "", "toString"])("opens the password step with any other start: %j", async (start) => {
    expect(input(await open("/login", { start }), "sign-in-password")).not.toBe("")
  })
})

describe("/signup", () => {
  it("shows Lane's sign-up form with its fields and links", async () => {
    const html = await open("/signup")
    expect(html).toMatch(/<h1[^>]*>Create your Lane account<\/h1>/)
    for (const id of ["sign-up-name", "sign-up-email"]) expect(input(html, id)).toContain('value=""')
    expect(input(html, "sign-up-password")).toContain('autoComplete="new-password"')
    expect(html).toContain('data-turnstile=""')
    expect(buttonsIn(html).map((button) => button.name)).toContain("Continue with Google")
    expect(submits(html)).toEqual(["Create account"])
    expect(links(html)).toContainEqual(["Sign in", "/login"])
    expect(html).not.toMatch(/id="sign-up-alert"/)
  })

  it("fills in the email, and keeps it and the return address on Sign in", async () => {
    const html = await open("/signup", { email: MEI, redirect_url: "/invite/inv_1", start: "code-request" })
    expect(input(html, "sign-up-email")).toContain(`value="${MEI}"`)
    expect(links(html)).toContainEqual(["Sign in", "/login?email=mei%40example.test&redirect_url=%2Finvite%2Finv_1"])
  })
})

describe.each(["/login", "/signup"] as const)("%s for anyone", (address) => {
  // Google's own codes, one Better Auth adds, and one Lane has never seen: only Google's redirect brings an error here.
  it.each(["access_denied", "account_not_linked", "interaction_required", "TOO_MANY_CODES"])("shows Lane's Google line for ?error=%s", async (error) => {
    const html = await open(address, { error, error_description: BETTER_AUTH_MESSAGE })
    expect(markupWords(withoutHidden(html))).toContain(GOOGLE_LINE)
  })

  it.each([undefined, ""])("shows no line without an error: %j", async (error) => {
    expect(markupWords(await open(address, { error }))).not.toContain(GOOGLE_LINE)
  })

  it("reads the first of a repeated name", async () => {
    const html = await open(address, { email: [MEI, "ada@example.test"], redirect_url: ["/inbox", "/impact"], error: ["access_denied", "x"] })
    expect(html).toContain(`value="${MEI}"`)
    expect(html).toContain("redirect_url=%2Finbox")
    expect(markupWords(html)).toContain(GOOGLE_LINE)
  })

  it.each(["https://x", "//x", "/\\x", "/\t/x", "x"])("never passes on the unsafe return address %j", async (redirect_url) => {
    expect(await open(address, { redirect_url })).not.toContain("redirect_url")
  })
})

describe.each<[string, Session]>([
  ["someone signed in", { userId: "user_mei", orgId: "org_test_a", role: "member" }],
  ["someone signed in with no workspace", { userId: "user_mei", orgId: null, role: null }],
])("%s", (_who, session) => {
  beforeEach(() => void (visit.session = session))

  describe.each(["/login", "/signup"] as const)("at %s", (address) => {
    it("goes to the safe return address", async () => {
      expect(await redirectOf(address, { redirect_url: "/requests/r1?view=board" })).toBe("/requests/r1?view=board")
      expect(await redirectOf(address, { redirect_url: "/invite/inv_1", email: MEI, error: "access_denied" })).toBe("/invite/inv_1")
    })

    it.each([undefined, "", "https://x", "//x", "/\\x", "/\t/x"])("goes to / when the return address is %j", async (redirect_url) => {
      expect(await redirectOf(address, { redirect_url })).toBe("/")
    })
  })

  // A reset signs in on its own screen, so a session is no reason to leave it.
  it.each(["/forgot-password", "/reset-password"] as const)("still gets %s", async (address) => {
    expect(await redirectOf(address)).toBeNull()
  })
})

describe.each(["/forgot-password", "/reset-password"] as const)("%s", (address) => {
  it("shows Lane's reset form with its field and links", async () => {
    const html = await open(address)
    expect(html).toMatch(/<h1[^>]*>Forgot your password\?<\/h1>/)
    expect(input(html, "reset-email")).toContain('value=""')
    expect(html).toContain('data-turnstile=""')
    expect(submits(html)).toEqual(["Send reset code"])
    expect(links(html)).toContainEqual(["Sign in", "/login"])
  })

  it("fills in the email", async () => {
    expect(input(await open(address, { email: MEI }), "reset-email")).toContain(`value="${MEI}"`)
  })
})

it("keeps each page's tab name", async () => {
  const titles = await Promise.all(ADDRESSES.map(async (address) => [address, (await PAGES[address]()).metadata.title]))
  expect(titles).toEqual([["/login", "Sign in"], ["/signup", "Sign up"], ["/forgot-password", "Forgot password"], ["/reset-password", "Reset password"]])
})

// Every screen the tests above rendered.
afterAll(() => {
  expect(rendered.length).toBeGreaterThan(20)
  for (const html of rendered) expect(html).not.toContain(BETTER_AUTH_MESSAGE)
})
