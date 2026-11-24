/**
 * #362 (spec #358 seam 2): Inbox email gives way to auth email. Once Inbox email is really sending and Resend has
 * refused a send that day, Email items hold, unclaimed, until the pause ends; Slack DMs carry on. Real database,
 * member rows, the pause injected through the delivery-run options; nothing touches the network.
 */
import { randomBytes, randomUUID } from "node:crypto"
import postgres from "postgres"
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { addMembers } from "@/test/member-fixtures"
import { requireTestDatabase } from "@/test/test-database"
import { createInMemoryEmailPause, type EmailPause } from "./email-pause"
import { slackDelivery } from "./feature-switches"
import type { DeliveryRun } from "./inbox-delivery"
import { recordingMessenger, type Messenger, type OutgoingMessage, type SendResult } from "./messenger"

const ORG = "org_delivery_pause"
const [REQUESTER, REVIEWER, SECOND_REVIEWER, SLACKER, GUEST] = ["pause_requester", "pause_reviewer", "pause_second_reviewer", "pause_slacker", "pause_guest"]

vi.mock("./session", () => ({ readSession: vi.fn(async () => null) }))

const url = new URL(process.env.DATABASE_URL!)
requireTestDatabase(process.env.DATABASE_URL);
const connection = postgres(url.toString(), { max: 1, prepare: false, onnotice: () => {} })
const APP = "https://lane.example.test"
const NOW = new Date("2026-10-28T12:00:00Z")
/** The pause set at NOW ends at the next 00:00 UTC. */
const TOMORROW = new Date("2026-10-29T12:00:00Z")
const SLACK_ON = slackDelivery({ LANE_SLACK_DELIVERY: "1", SLACK_CLIENT_ID: "1.2", SLACK_CLIENT_SECRET: "s", LANE_SLACK_TOKEN_KEY: randomBytes(32).toString("base64") })

/** A real Email sender (outcome "sent"), answering each send in turn from `answers`, then success. */
function sender(answers: SendResult[] = []): Messenger & { messages: OutgoingMessage[] } {
  const messages: OutgoingMessage[] = []
  return { outcome: "sent", messages, async send(message) { messages.push(message); return answers.shift() ?? { ok: true } } }
}
const review = (userId: string) => ({ id: randomUUID(), nominee: { kind: "member", userId }, displayNameAtSelection: userId, addedBy: REQUESTER, note: "", decision: null })
async function asked(...reviewers: string[]) {
  const [{ id }] = await connection`insert into requests(org_id,title,description,created_by) values (${ORG},'Checkout drop-off','Fixture',${REQUESTER}) returning id`
  await connection`insert into request_agreements(request_id,org_id,reviewers) values (${id},${ORG},${connection.json(reviewers.map(review) as never)})`
  return id as string
}
const prefer = (userId: string, channel: string) => connection`insert into delivery_preferences(org_id,user_id,channel) values (${ORG},${userId},${channel})`
const connectSlack = async () => {
  if (!SLACK_ON.on) throw Error("switch")
  const { saveSlackConnection } = await import("./slack-connection")
  await saveSlackConnection({ orgId: ORG, userId: REQUESTER }, { token: "xoxb-1-2-pausetoken", teamId: "T1", teamName: "Acme" }, { tokenKey: SLACK_ON.tokenKey })
}
const logged = (id: string) => connection`select user_id, channel, outcome from delivery_log where request_id = ${id}`

beforeAll(async () => {
  await connection`insert into organizations(id,name,slug) values (${ORG},'Acme','delivery-pause')`
  for (const id of [REQUESTER, REVIEWER, SECOND_REVIEWER, SLACKER, GUEST]) await connection`insert into profiles(id,full_name,email) values (${id},${id},${id + "@example.test"})`
  await addMembers(ORG, { [REQUESTER]: "member", [REVIEWER]: "member", [SECOND_REVIEWER]: "member", [SLACKER]: "member", [GUEST]: "guest" })
})
beforeEach(async () => {
  await connection`delete from delivery_preferences where org_id = ${ORG}`
  await connection`delete from slack_connections where org_id = ${ORG}`
  await connection`delete from requests where org_id = ${ORG} and status in ('open','in_progress')`
  await connection`delete from delivery_log where org_id = ${ORG}`
})
afterAll(() => connection.end())

const delivery = () => import("./inbox-delivery")
const needsYou = async (requestId: string, run: Partial<DeliveryRun>) => (await delivery()).deliverRequestNeedsYou({ orgId: ORG, requestId }, { now: NOW, appUrl: APP, ...run })
async function pausedAt(now: Date): Promise<EmailPause> {
  const pause = createInMemoryEmailPause()
  await pause.pause(now)
  return pause
}

describe("while Inbox email is paused", () => {
  it("holds a Needs-you item unclaimed, and a run after the pause ends sends it", async () => {
    const id = await asked(REVIEWER)
    const emailPause = await pausedAt(NOW)
    const held = sender()
    expect(await needsYou(id, { messenger: held, emailPause })).toEqual({ sent: 0, skipped: 1, failed: 0 })
    expect(held.messages).toEqual([])
    expect(await logged(id)).toEqual([])

    const later = sender()
    expect(await needsYou(id, { messenger: later, emailPause, now: TOMORROW })).toEqual({ sent: 1, skipped: 0, failed: 0 })
    expect(later.messages.map((m) => m.to)).toEqual([`${REVIEWER}@example.test`])
    expect(await logged(id)).toEqual([{ user_id: REVIEWER, channel: "email", outcome: "sent" }])
  })

  it("holds a Guest email unclaimed, and a run after the pause ends sends it", async () => {
    const [{ id }] = await connection`insert into requests(org_id,title,description,created_by,guest_submission,taken_on_by,taken_on_at)
      values (${ORG},'Dark mode','Too bright at night.',${GUEST},true,${REQUESTER},${NOW}) returning id`
    const guestEmail = async (run: Partial<DeliveryRun>) => (await delivery()).deliverGuestEmail({ orgId: ORG, requestId: id, kind: "taken_on" }, { now: NOW, appUrl: APP, ...run })
    const emailPause = await pausedAt(NOW)
    const held = sender()
    expect(await guestEmail({ messenger: held, emailPause })).toEqual({ sent: 0, skipped: 1, failed: 0 })
    expect(held.messages).toEqual([])
    expect(await logged(id)).toEqual([])

    const later = sender()
    expect(await guestEmail({ messenger: later, emailPause, now: TOMORROW })).toEqual({ sent: 1, skipped: 0, failed: 0 })
    expect(later.messages.map((m) => m.to)).toEqual([`${GUEST}@example.test`])
  })

  it("holds the Email fallback when Slack can't reach the person, and a run after the pause ends sends it", async () => {
    await connectSlack()
    await prefer(SLACKER, "slack")
    const id = await asked(SLACKER)
    const notInSlack: Messenger = { outcome: "sent", send: async () => ({ ok: false, reason: "slack_users_not_found", useEmail: true }) }
    const emailPause = await pausedAt(NOW)
    const held = sender()
    expect(await needsYou(id, { messenger: held, emailPause, slack: SLACK_ON, slackMessenger: () => notInSlack })).toEqual({ sent: 0, skipped: 1, failed: 0 })
    expect(held.messages).toEqual([])
    expect(await logged(id)).toEqual([])

    const later = sender()
    expect(await needsYou(id, { messenger: later, emailPause, now: TOMORROW, slack: SLACK_ON, slackMessenger: () => notInSlack })).toEqual({ sent: 1, skipped: 0, failed: 0 })
    expect(await logged(id)).toEqual([{ user_id: SLACKER, channel: "email", outcome: "sent" }])
  })

  it("still sends a Slack DM", async () => {
    await connectSlack()
    await prefer(SLACKER, "slack")
    const id = await asked(SLACKER)
    const dm = recordingMessenger()
    const email = sender()
    expect(await needsYou(id, { messenger: email, emailPause: await pausedAt(NOW), slack: SLACK_ON, slackMessenger: () => dm })).toEqual({ sent: 1, skipped: 0, failed: 0 })
    expect(dm.messages.map((m) => m.channel)).toEqual(["slack"])
    expect(email.messages).toEqual([])
  })

  it("holds a time-caused item for a later daily run", async () => {
    const [{ id }] = await connection`insert into requests(org_id,title,description,created_by,status,done_at)
      values (${ORG},'Done a week ago','Fixture',${REQUESTER},'done','2026-10-20T09:00:00Z') returning id`
    const daily = async (run: Partial<DeliveryRun>) => (await delivery()).runDailyDelivery({ now: NOW, appUrl: APP, ...run })
    const emailPause = await pausedAt(NOW)
    const held = sender()
    await daily({ messenger: held, emailPause })
    expect(held.messages).toEqual([])
    expect(await logged(id)).toEqual([])

    const later = sender()
    await daily({ messenger: later, emailPause, now: TOMORROW })
    expect(later.messages.filter((m) => m.text.includes(id)).map((m) => m.subject)).toEqual([expect.stringContaining("Record the release")])
  })
})

describe("when Resend refuses an Inbox send", () => {
  it.each(["resend_429", "resend_503"])("%s pauses Inbox email, and the run's later Email items hold unclaimed", async (reason) => {
    const id = await asked(REVIEWER, SECOND_REVIEWER)
    const emailPause = createInMemoryEmailPause()
    const refused = sender([{ ok: false, reason }])
    expect(await needsYou(id, { messenger: refused, emailPause })).toEqual({ sent: 0, skipped: 1, failed: 1 })
    expect(refused.messages).toHaveLength(1)
    expect(await logged(id)).toEqual([])
    expect(await emailPause.isPaused(NOW)).toBe(true)
  })

  it.each(["resend_timeout", "resend_unreachable"])("%s doesn't pause Inbox email", async (reason) => {
    const id = await asked(REVIEWER, SECOND_REVIEWER)
    const emailPause = createInMemoryEmailPause()
    const flaky = sender([{ ok: false, reason }])
    expect(await needsYou(id, { messenger: flaky, emailPause })).toEqual({ sent: 1, skipped: 0, failed: 1 })
    expect(flaky.messages).toHaveLength(2)
    expect(await emailPause.isPaused(NOW)).toBe(false)
  })

  it("holds the run's later Email items even when the pause couldn't be recorded", async () => {
    const id = await asked(REVIEWER, SECOND_REVIEWER)
    const unrecorded: EmailPause = { pause: async () => {}, isPaused: async () => false }
    const refused = sender([{ ok: false, reason: "resend_429" }])
    expect(await needsYou(id, { messenger: refused, emailPause: unrecorded })).toEqual({ sent: 0, skipped: 1, failed: 1 })
    expect(refused.messages).toHaveLength(1)
  })
})

describe("the pause check", () => {
  it("holds the run's Email items when it rejects while Inbox email is sending", async () => {
    const id = await asked(REVIEWER, SECOND_REVIEWER)
    const unreadable: EmailPause = { pause: async () => {}, isPaused: async () => { throw new Error("kv down") } }
    const held = sender()
    expect(await needsYou(id, { messenger: held, emailPause: unreadable })).toEqual({ sent: 0, skipped: 2, failed: 0 })
    expect(held.messages).toEqual([])
    expect(await logged(id)).toEqual([])
  })

  it.each([true, false])("is never consulted with Inbox email switched off (paused: %s), and the stand-in records would send", async (paused) => {
    const id = await asked(REVIEWER)
    const emailPause = { pause: vi.fn(async () => {}), isPaused: vi.fn(async () => paused) }
    const standIn = recordingMessenger()
    expect(await needsYou(id, { messenger: standIn, emailPause })).toEqual({ sent: 1, skipped: 0, failed: 0 })
    expect(standIn.messages.map((m) => m.to)).toEqual([`${REVIEWER}@example.test`])
    expect(await logged(id)).toEqual([{ user_id: REVIEWER, channel: "email", outcome: "would_send" }])
    expect(emailPause.isPaused).not.toHaveBeenCalled()
    expect(emailPause.pause).not.toHaveBeenCalled()
  })

  it("logs exactly once per paused run that Inbox email is paused for today", async () => {
    const id = await asked(REVIEWER, SECOND_REVIEWER)
    const info = vi.spyOn(console, "info").mockImplementation(() => {})
    try {
      await needsYou(id, { messenger: sender(), emailPause: await pausedAt(NOW) })
      expect(info.mock.calls.filter(([line]) => /Inbox email is paused for today/.test(String(line)))).toHaveLength(1)
    } finally {
      info.mockRestore()
    }
  })
})
