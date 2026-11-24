/**
 * #389 (spec #383): Lane's server door to Better Auth, called as a Server Action calls it, from a person's own
 * browser, on a local lane_test database. Only outbound HTTP is faked.
 */
import { revalidatePath } from "next/cache"
import { cookies, headers } from "next/headers"
import { after } from "next/server"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { askAuthServer } from "@/lib/auth-server"
import { AuthBrowser, authRouteTestFile, codeOf, fakeOutbound, switchOnAuthRoute, type Outbound } from "@/test/auth-route-browser"

const { connection, domain, signedIn, createWorkspace } = authRouteTestFile("auth-door.test")

let outbound: Outbound
beforeEach(() => {
  switchOnAuthRoute()
  outbound = fakeOutbound()
})

async function adminWithWorkspace(label: string) {
  const admin = await signedIn(outbound, label)
  return { ...admin, workspaceId: await createWorkspace(admin.browser) }
}
const rename = (browser: AuthBrowser, organizationId: string, name: string) =>
  browser.action(() => askAuthServer((api, asCaller) => api.updateOrganization({ ...asCaller, body: { organizationId, data: { name } } })))
const invite = (browser: AuthBrowser, email: string, organizationId: string) =>
  browser.action(() => askAuthServer((api, asCaller) => api.createInvitation({ ...asCaller, body: { email, role: "member", organizationId } })))
const nameOf = async (workspaceId: string) => (await connection`select name from organizations where id = ${workspaceId}`)[0].name

describe("the server door", () => {
  it("answers what Better Auth answered, as the person whose request it is", async () => {
    const { browser, workspaceId } = await adminWithWorkspace("asker")
    expect(await rename(browser, workspaceId, "Renamed studio")).toMatchObject({ ok: true, data: { id: workspaceId, name: "Renamed studio" } })
    expect(await nameOf(workspaceId)).toBe("Renamed studio")
  })

  it("answers Better Auth's refusal as its code, and changes nothing", async () => {
    const { browser, workspaceId } = await adminWithWorkspace("owner")
    const stranger = await signedIn(outbound, "stranger")
    expect(await rename(stranger.browser, workspaceId, "Taken over")).toEqual({ ok: false, code: "USER_IS_NOT_A_MEMBER_OF_THE_ORGANIZATION" })
    expect(await invite(new AuthBrowser(), `nobody@${domain}`, workspaceId)).toEqual({ ok: false, code: "UNAUTHORIZED" })
    expect(await nameOf(workspaceId)).toBe("Wren's studio")
    expect(await rename(browser, workspaceId, "Still ours")).toMatchObject({ ok: true })
  })

  it("answers no code while Better Auth is off", async () => {
    const { browser, workspaceId } = await adminWithWorkspace("off")
    vi.stubEnv("BETTER_AUTH_SECRET", "")
    expect(await rename(browser, workspaceId, "Renamed studio")).toEqual({ ok: false })
    expect(await nameOf(workspaceId)).toBe("Wren's studio")
  })

  it("throws what isn't Better Auth's answer, as any action does", async () => {
    const { browser } = await signedIn(outbound, "thrower")
    await expect(browser.action(() => askAuthServer(async () => Promise.reject(new Error("the database is away"))))).rejects.toThrow("the database is away")
  })

  it("answers a failed email with the route's own Lane code", async () => {
    const { browser, workspaceId } = await adminWithWorkspace("inviter")
    outbound.resend = () => Response.json({ name: "application_error" }, { status: 500 })
    const fromRoute = await browser.post("/organization/invite-member", { email: `routed@${domain}`, role: "member", organizationId: workspaceId })
    expect(codeOf(fromRoute)).toBe("INVITATION_NOT_SENT")
    expect(await invite(browser, `doored@${domain}`, workspaceId)).toEqual({ ok: false, code: "INVITATION_NOT_SENT" })
  })

  it("keeps two concurrent requests' answers apart", async () => {
    const [failing, sending] = [await adminWithWorkspace("failing"), await adminWithWorkspace("sending")]
    const unlucky = `unlucky@${domain}`
    outbound.resend = (call) => (call.body.includes(unlucky) ? Response.json({ name: "application_error" }, { status: 500 }) : Response.json({ id: "email_sent" }))
    const [failed, sent] = await Promise.all([invite(failing.browser, unlucky, failing.workspaceId), invite(sending.browser, `lucky@${domain}`, sending.workspaceId)])
    expect(failed).toEqual({ ok: false, code: "INVITATION_NOT_SENT" })
    expect(sent).toMatchObject({ ok: true, data: { email: `lucky@${domain}`, organizationId: sending.workspaceId } })
  })

  // The app frame's session request renews the session and its cookie together. A cookie written by an action also
  // makes Next draw the page on screen again in the action's answer.
  it("writes no cookie and leaves the session's renewal to the frame's request", async () => {
    const { browser, userId, workspaceId } = await adminWithWorkspace("unrenewed")
    await connection`update session set expires_at = now() + interval '5 days', updated_at = now() - interval '2 days' where user_id = ${userId}`
    const renewal = async () => (await connection`select expires_at, updated_at from session where user_id = ${userId}`)[0]
    const before = await renewal()
    const cookiesSet = vi.spyOn(browser.cookies, "set")
    expect(await rename(browser, workspaceId, "Renamed studio")).toMatchObject({ ok: true })
    expect(await renewal()).toEqual(before)
    expect(cookiesSet).not.toHaveBeenCalled()
  })
})

describe("a Server Action as a browser's person", () => {
  it("reads the browser's cookies and headers, keeps the cookies the action writes, and runs its after-response work", async () => {
    const { browser } = await signedIn(outbound, "caller")
    let afterwards = false
    const seen = await browser.action(
      async () => {
        const [jar, head] = [await cookies(), await headers()]
        jar.set("lane-test", "kept")
        after(() => void (afterwards = true))
        revalidatePath("/")
        return { session: jar.has("better-auth.session_token"), address: head.get("x-vercel-forwarded-for"), agent: head.get("user-agent") }
      },
      { "user-agent": "Lane test browser" },
    )
    expect(seen).toEqual({ session: true, address: browser.ip, agent: "Lane test browser" })
    expect(browser.cookies.get("lane-test")).toBe("kept")
    expect(afterwards).toBe(true)
    expect(await new AuthBrowser().action(async () => (await cookies()).getAll())).toEqual([])
  })
})
