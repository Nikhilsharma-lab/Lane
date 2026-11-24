/**
 * #389 (#383 story 11): the app frame's session request, through Lane's browser auth client and the real auth route,
 * on a local lane_test database. The frame's timing is session-request.test.ts's.
 */
import { beforeEach, expect, it, vi } from "vitest"
import { AUTH_ORIGIN, authRouteTestFile, fakeOutbound, switchOnAuthRoute, type AuthAnswer, type AuthBrowser, type Outbound } from "@/test/auth-route-browser"

const { connection, signedIn } = authRouteTestFile("session-renewal.test")
const DAY = 24 * 60 * 60 * 1000

let outbound: Outbound
beforeEach(() => {
  switchOnAuthRoute()
  outbound = fakeOutbound()
})

/** One full load of the page in this browser: the frame's one request, answered by the auth route. */
async function frameAsks(browser: AuthBrowser) {
  const answers: AuthAnswer[] = []
  vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = new URL(input instanceof Request ? input.url : input, AUTH_ORIGIN).pathname.replace(/^\/api\/auth/, "")
    const answer = await browser.call(init?.method === "POST" ? "POST" : "GET", path)
    answers.push(answer)
    return Response.json(answer.body, { status: answer.status })
  })
  vi.resetModules()
  const { keepSession } = await import("./session-keeper")
  await keepSession()
  expect(answers.map(({ status }) => status)).toEqual([200])
  return answers[0]
}
/** Puts the person's session `days` back, as if they had last used Lane then. */
const age = (userId: string, days: number) =>
  connection`update session set updated_at = now() - ${days} * interval '1 day', expires_at = now() + ${7 - days} * interval '1 day' where user_id = ${userId}`
const dates = async (userId: string) => (await connection`select updated_at as "lastUsed", expires_at as "ends" from session where user_id = ${userId}`)[0] as { lastUsed: Date; ends: Date }

it("renews a session more than a day old, and its cookie, and moves its last-used date", async () => {
  const { browser, userId } = await signedIn(outbound, "returning")
  await age(userId, 2)
  const answer = await frameAsks(browser)

  const { lastUsed, ends } = await dates(userId)
  expect(Math.abs(lastUsed.getTime() - Date.now())).toBeLessThan(60_000)
  expect(Math.abs(ends.getTime() - (Date.now() + 7 * DAY))).toBeLessThan(60_000)
  expect(answer.headers.getSetCookie().join("\n")).toMatch(/better-auth\.session_token=[^;]+;.*Max-Age=604800/i)
})

it("leaves a session used within the day as it is", async () => {
  const { browser, userId } = await signedIn(outbound, "today")
  await age(userId, 0.5)
  const before = await dates(userId)
  await frameAsks(browser)
  expect(await dates(userId)).toEqual(before)
})
