/**
 * #206: the Email adapter and the switch that chooses it. Email goes out only when `LANE_EMAIL_DELIVERY=1` with
 * both credentials; otherwise delivery uses the recording stand-in. The adapter is checked against a fake
 * `fetch`, so no test reaches the network.
 */
import { describe, expect, it } from "vitest"
import { appOrigin, cronSecret, emailDelivery } from "./feature-switches"
import { recordingMessenger, resendMessenger, RESEND_EMAILS_URL, type OutgoingMessage } from "./messenger"

const message: OutgoingMessage = { channel: "email", to: "ravi@example.test", subject: "Waiting for your review: LAN-12 · Checkout", text: "Open the Request: https://lane.test/requests/1", idempotencyKey: "lane-inbox-abc" }

describe("the switches", () => {
  it("keeps Email off unless switched on with both credentials", () => {
    expect(emailDelivery({})).toEqual({ on: false, reason: "switched_off" })
    expect(emailDelivery({ LANE_EMAIL_DELIVERY: "true", RESEND_API_KEY: "re_x", LANE_EMAIL_FROM: "Lane <inbox@uselane.app>" })).toEqual({ on: false, reason: "switched_off" })
    expect(emailDelivery({ LANE_EMAIL_DELIVERY: "1", RESEND_API_KEY: "re_x" })).toEqual({ on: false, reason: "missing_credentials" })
    expect(emailDelivery({ LANE_EMAIL_DELIVERY: "1", RESEND_API_KEY: "re_x", LANE_EMAIL_FROM: "Lane <inbox@uselane.app>" })).toEqual({ on: true, apiKey: "re_x", from: "Lane <inbox@uselane.app>" })
  })

  it("has no daily-job secret until one is set, and links to the app's own origin", () => {
    expect(cronSecret({})).toBeNull()
    expect(cronSecret({ CRON_SECRET: "  " })).toBeNull()
    expect(cronSecret({ CRON_SECRET: "s3cret" })).toBe("s3cret")
    expect(appOrigin({ NEXT_PUBLIC_APP_URL: "https://app.uselane.app/" })).toBe("https://app.uselane.app")
  })
})

describe("the messengers", () => {
  it("the stand-in sends nothing and records each message, so the log says would send", async () => {
    const standIn = recordingMessenger()
    expect(await standIn.send(message)).toEqual({ ok: true })
    expect(standIn.messages).toEqual([message])
    expect(standIn.outcome).toBe("would_send")
  })

  it("the Email adapter sends one plain-text email per message through Resend", async () => {
    const calls: { url: string; init: RequestInit }[] = []
    const email = resendMessenger({ apiKey: "re_test", from: "Lane <inbox@uselane.app>", fetch: (async (url: string, init: RequestInit) => { calls.push({ url, init }); return new Response("{}", { status: 200 }) }) as typeof fetch })
    expect(email.outcome).toBe("sent")
    expect(await email.send(message)).toEqual({ ok: true })
    expect(calls).toHaveLength(1)
    expect(calls[0].url).toBe(RESEND_EMAILS_URL)
    expect(calls[0].init.headers).toMatchObject({ Authorization: "Bearer re_test", "Idempotency-Key": "lane-inbox-abc" })
    expect(JSON.parse(String(calls[0].init.body))).toEqual({ from: "Lane <inbox@uselane.app>", to: ["ravi@example.test"], subject: message.subject, text: message.text })
  })

  it("the Email adapter reports a refusal or an outage without throwing or naming the recipient", async () => {
    const refused = resendMessenger({ apiKey: "k", from: "f", fetch: (async () => new Response("{}", { status: 422 })) as typeof fetch })
    expect(await refused.send(message)).toEqual({ ok: false, reason: "resend_422" })
    const down = resendMessenger({ apiKey: "k", from: "f", fetch: (async () => { throw new TypeError("fetch failed") }) as typeof fetch })
    expect(await down.send(message)).toEqual({ ok: false, reason: "resend_unreachable" })
  })
})
