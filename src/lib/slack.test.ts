/**
 * #207: the Slack pieces that need no database. The switch that allows Slack at all, the sealed form the bot
 * token is stored in, Slack's install flow (the link out and the code coming back), and the Slack DM adapter
 * behind the messenger interface. Every Slack call goes to a fake `fetch`, so no test reaches the network.
 */
import { randomBytes } from "node:crypto"
import { describe, expect, it } from "vitest"
import { slackDelivery } from "./feature-switches"
import { slackMessenger, SLACK_API, type OutgoingMessage } from "./messenger"
import { exchangeSlackCode, readInstallState, revokeSlackToken, signInstallState, slackAuthorizeUrl, SLACK_SCOPES } from "./slack-install"
import { openSlackToken, sealSlackToken } from "./slack-token"

const KEY = randomBytes(32)
const KEY_TEXT = KEY.toString("base64")
const TOKEN = "xoxb-1111-2222-abcdefabcdefabcdef"

type Call = { url: string; init: RequestInit }
function fakeSlack(answers: Record<string, unknown | ((body: string) => unknown)>, status = 200) {
  const calls: Call[] = []
  const fetch = (async (url: string, init: RequestInit) => {
    calls.push({ url, init })
    const method = url.replace(`${SLACK_API}/`, "")
    const answer = answers[method]
    const body = typeof answer === "function" ? (answer as (b: string) => unknown)(String(init.body ?? "")) : answer
    return new Response(JSON.stringify(body ?? { ok: false, error: "unknown_method" }), { status })
  }) as typeof globalThis.fetch
  return { fetch, calls }
}

describe("the Slack switch", () => {
  const on = { LANE_SLACK_DELIVERY: "1", SLACK_CLIENT_ID: "123.456", SLACK_CLIENT_SECRET: "shh", LANE_SLACK_TOKEN_KEY: KEY_TEXT }

  it("is off unless switched on with the app's credentials and a 32-byte key", () => {
    expect(slackDelivery({})).toEqual({ on: false, reason: "switched_off" })
    expect(slackDelivery({ ...on, LANE_SLACK_DELIVERY: "true" })).toEqual({ on: false, reason: "switched_off" })
    expect(slackDelivery({ ...on, SLACK_CLIENT_SECRET: " " })).toEqual({ on: false, reason: "missing_credentials" })
    expect(slackDelivery({ ...on, LANE_SLACK_TOKEN_KEY: randomBytes(16).toString("base64") })).toEqual({ on: false, reason: "missing_credentials" })
    expect(slackDelivery(on)).toEqual({ on: true, clientId: "123.456", clientSecret: "shh", tokenKey: KEY })
  })

  it("takes the key as hex too", () => {
    expect(slackDelivery({ ...on, LANE_SLACK_TOKEN_KEY: KEY.toString("hex") })).toMatchObject({ on: true, tokenKey: KEY })
  })
})

describe("the stored token", () => {
  it("is sealed: the stored text never contains the token, and opens only with the same key and workspace", () => {
    const sealed = sealSlackToken(TOKEN, { key: KEY, orgId: "org_a" })
    expect(sealed).toMatch(/^v1:[A-Za-z0-9_-]+:[A-Za-z0-9_-]+:[A-Za-z0-9_-]+$/)
    expect(sealed).not.toContain("xoxb")
    expect(sealSlackToken(TOKEN, { key: KEY, orgId: "org_a" })).not.toBe(sealed)
    expect(openSlackToken(sealed, { key: KEY, orgId: "org_a" })).toBe(TOKEN)
    expect(openSlackToken(sealed, { key: randomBytes(32), orgId: "org_a" })).toBeNull()
    expect(openSlackToken(sealed, { key: KEY, orgId: "org_b" })).toBeNull()
    expect(openSlackToken(sealed.slice(0, -2) + "AA", { key: KEY, orgId: "org_a" })).toBeNull()
    expect(openSlackToken("xoxb-plain", { key: KEY, orgId: "org_a" })).toBeNull()
  })
})

describe("Slack's install flow", () => {
  const app = { clientId: "123.456", clientSecret: "shh" }
  const now = new Date("2026-10-25T12:00:00Z")

  it("sends the Admin to Slack's standard install page asking only to send DMs and find people by email", () => {
    const url = new URL(slackAuthorizeUrl({ clientId: app.clientId, redirectUri: "https://lane.test/api/slack/callback", state: "s" }))
    expect(`${url.origin}${url.pathname}`).toBe("https://slack.com/oauth/v2/authorize")
    expect(Object.fromEntries(url.searchParams)).toEqual({ client_id: "123.456", scope: "chat:write,users:read,users:read.email", redirect_uri: "https://lane.test/api/slack/callback", state: "s" })
    expect(SLACK_SCOPES).toEqual(["chat:write", "users:read", "users:read.email"])
  })

  it("signs the round trip to the Admin and workspace who started it, for ten minutes", () => {
    const state = signInstallState({ orgId: "org_a", userId: "user_a" }, { secret: app.clientSecret, now })
    expect(readInstallState(state, { secret: app.clientSecret, now })).toEqual({ orgId: "org_a", userId: "user_a" })
    expect(readInstallState(state, { secret: app.clientSecret, now: new Date("2026-10-25T12:09:59Z") })).toEqual({ orgId: "org_a", userId: "user_a" })
    expect(readInstallState(state, { secret: app.clientSecret, now: new Date("2026-10-25T12:10:01Z") })).toBeNull()
    expect(readInstallState(state, { secret: "other", now })).toBeNull()
    const [body, mac] = state.split(".")
    const forged = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(body, "base64url").toString()), orgId: "org_b" })).toString("base64url")
    expect(readInstallState(`${forged}.${mac}`, { secret: app.clientSecret, now })).toBeNull()
    expect(readInstallState("nonsense", { secret: app.clientSecret, now })).toBeNull()
  })

  it("trades Slack's code for the bot token and the Slack team", async () => {
    const slack = fakeSlack({ "oauth.v2.access": { ok: true, token_type: "bot", access_token: TOKEN, team: { id: "T1", name: "Acme" } } })
    expect(await exchangeSlackCode({ ...app, code: "c0de", redirectUri: "https://lane.test/api/slack/callback", fetch: slack.fetch }))
      .toEqual({ ok: true, token: TOKEN, teamId: "T1", teamName: "Acme" })
    expect(slack.calls[0].url).toBe(`${SLACK_API}/oauth.v2.access`)
    expect(Object.fromEntries(new URLSearchParams(String(slack.calls[0].init.body)))).toEqual({ client_id: "123.456", client_secret: "shh", code: "c0de", redirect_uri: "https://lane.test/api/slack/callback" })
  })

  it("reports a refused or unreachable exchange by reason only", async () => {
    expect(await exchangeSlackCode({ ...app, code: "x", redirectUri: "r", fetch: fakeSlack({ "oauth.v2.access": { ok: false, error: "invalid_code" } }).fetch }))
      .toEqual({ ok: false, reason: "slack_invalid_code" })
    expect(await exchangeSlackCode({ ...app, code: "x", redirectUri: "r", fetch: fakeSlack({ "oauth.v2.access": { ok: true, token_type: "user", access_token: "xoxp-1" } }).fetch }))
      .toEqual({ ok: false, reason: "slack_no_bot_token" })
    const down = (async () => { throw new TypeError("fetch failed") }) as typeof fetch
    expect(await exchangeSlackCode({ ...app, code: "x", redirectUri: "r", fetch: down })).toEqual({ ok: false, reason: "slack_unreachable" })
  })

  it("revokes the token on disconnect, never throwing", async () => {
    const slack = fakeSlack({ "auth.revoke": { ok: true, revoked: true } })
    expect(await revokeSlackToken(TOKEN, { fetch: slack.fetch })).toBe(true)
    expect(slack.calls[0].init.headers).toMatchObject({ Authorization: `Bearer ${TOKEN}` })
    expect(await revokeSlackToken(TOKEN, { fetch: (async () => { throw new TypeError("x") }) as typeof fetch })).toBe(false)
  })
})

describe("the Slack DM adapter", () => {
  const message: OutgoingMessage = { channel: "slack", to: "ravi@example.test", subject: "Waiting for your review: LAN-12 · Checkout", text: "LAN-12 · Checkout\n\nOpen the Request: https://lane.test/requests/1", idempotencyKey: "lane-inbox-abc" }

  it("finds the person in Slack by their email and sends them one DM", async () => {
    const slack = fakeSlack({ "users.lookupByEmail": { ok: true, user: { id: "U42" } }, "chat.postMessage": { ok: true, ts: "1.2" } })
    const dm = slackMessenger({ token: TOKEN, fetch: slack.fetch })
    expect(dm.outcome).toBe("sent")
    expect(await dm.send(message)).toEqual({ ok: true })
    expect(slack.calls.map(c => c.url)).toEqual([`${SLACK_API}/users.lookupByEmail`, `${SLACK_API}/chat.postMessage`])
    expect(new URLSearchParams(String(slack.calls[0].init.body)).get("email")).toBe("ravi@example.test")
    expect(slack.calls[1].init.headers).toMatchObject({ Authorization: `Bearer ${TOKEN}` })
    expect(JSON.parse(String(slack.calls[1].init.body))).toEqual({ channel: "U42", text: message.text, unfurl_links: false, unfurl_media: false })
  })

  it("looks each person up once per run", async () => {
    const slack = fakeSlack({ "users.lookupByEmail": { ok: true, user: { id: "U42" } }, "chat.postMessage": { ok: true } })
    const dm = slackMessenger({ token: TOKEN, fetch: slack.fetch })
    await dm.send(message)
    await dm.send({ ...message, idempotencyKey: "lane-inbox-def" })
    expect(slack.calls.filter(c => c.url.endsWith("users.lookupByEmail"))).toHaveLength(1)
  })

  it("says when Slack can't reach the person, so the item goes by Email instead", async () => {
    const missing = slackMessenger({ token: TOKEN, fetch: fakeSlack({ "users.lookupByEmail": { ok: false, error: "users_not_found" } }).fetch })
    expect(await missing.send(message)).toEqual({ ok: false, reason: "slack_users_not_found", useEmail: true })
    const revoked = slackMessenger({ token: TOKEN, fetch: fakeSlack({ "users.lookupByEmail": { ok: true, user: { id: "U1" } }, "chat.postMessage": { ok: false, error: "token_revoked" } }).fetch })
    expect(await revoked.send(message)).toEqual({ ok: false, reason: "slack_token_revoked", useEmail: true })
  })

  it("reports a passing outage without falling back, so a later run tries Slack again", async () => {
    const limited = slackMessenger({ token: TOKEN, fetch: fakeSlack({ "users.lookupByEmail": { ok: true, user: { id: "U1" } }, "chat.postMessage": { ok: false, error: "ratelimited" } }, 429).fetch })
    expect(await limited.send(message)).toEqual({ ok: false, reason: "slack_429" })
    const down = slackMessenger({ token: TOKEN, fetch: (async () => { throw new TypeError("fetch failed") }) as typeof fetch })
    expect(await down.send(message)).toEqual({ ok: false, reason: "slack_unreachable" })
  })
})
