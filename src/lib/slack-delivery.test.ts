/**
 * #207 seam 4: Needs-you items by Slack DM. People who chose Slack DM get one DM per item, linking to the Request,
 * while Slack is connected (switch on and a connection saved); while it isn't, or when Slack can't reach them,
 * they get Email instead. Real database, a mocked Clerk roster, both messengers swapped for recording stand-ins.
 */
import { randomBytes, randomUUID } from "node:crypto"
import postgres from "postgres"
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { requireTestDatabase } from "@/test/test-database"
import { slackDelivery, type SlackDelivery } from "./feature-switches"
import { recordingMessenger, type Messenger } from "./messenger"
import type { ReleaseFact } from "./request-release"

const ORG = "org_slack_delivery"
const REQUESTER = "slack_delivery_requester"
const REVIEWER = "slack_delivery_reviewer"
const EMAILER = "slack_delivery_emailer"
const TOKEN = "xoxb-5555-6666-deliverytoken"

vi.mock("@clerk/nextjs/server", () => ({
  auth: vi.fn(async () => ({ userId: null })),
  clerkClient: async () => ({
    organizations: {
      getOrganizationMembershipList: async ({ organizationId }: { organizationId: string }) => {
        const members = organizationId === "org_slack_delivery" ? ["slack_delivery_requester", "slack_delivery_reviewer", "slack_delivery_emailer"] : []
        return {
          totalCount: members.length,
          data: members.map((userId) => ({ organization: { id: organizationId }, role: "org:member", publicUserData: { userId, identifier: `${userId}@example.test`, firstName: userId } })),
        }
      },
    },
  }),
}))

const url = new URL(process.env.DATABASE_URL!)
requireTestDatabase(process.env.DATABASE_URL);
const connection = postgres(url.toString(), { max: 1, prepare: false, onnotice: () => {} })
const APP = "https://lane.example.test"
const NOW = new Date("2026-10-28T12:00:00Z")
const SLACK_ON = slackDelivery({ LANE_SLACK_DELIVERY: "1", SLACK_CLIENT_ID: "1.2", SLACK_CLIENT_SECRET: "s", LANE_SLACK_TOKEN_KEY: randomBytes(32).toString("base64") })
const SLACK_OFF: SlackDelivery = { on: false, reason: "switched_off" }
const fingerprint = "e".repeat(64)

const fact = (dueDate: string): ReleaseFact => ({ exposureDate: "2026-10-01", audience: "All shoppers", evidence: "Rollout log", dueDate, startDate: "2026-10-01", windowKind: "relative" })
const released = (dueDate: string) => ({ version: 1, ownerId: REQUESTER, release: fact(dueDate), history: [{ operationId: randomUUID(), fingerprint, actorId: REQUESTER, at: "2026-10-02T00:00:00Z", input: { kind: "release" }, previousRelease: null, release: fact(dueDate), previousOwnerId: REQUESTER, ownerId: REQUESTER, revision: 1 }] })
const review = (userId: string) => ({ id: randomUUID(), nominee: { kind: "member", userId }, displayNameAtSelection: "Ravi", addedBy: REQUESTER, note: "", decision: null })

async function request(values: { title: string; status?: string; doneAt?: string; releaseState?: unknown; reviewers?: unknown[] }) {
  const [{ id }] = await connection`insert into requests(org_id,title,description,created_by,status,done_at,release_state)
    values (${ORG},${values.title},'Fixture',${REQUESTER},${values.status ?? "open"},${values.doneAt ?? null},
      ${values.releaseState ? connection.json(values.releaseState as never) : null}) returning id`
  if (values.reviewers) await connection`insert into request_agreements(request_id,org_id,reviewers) values (${id},${ORG},${connection.json(values.reviewers as never)})`
  return id as string
}
const prefer = (userId: string, channel: string) =>
  connection`insert into delivery_preferences(org_id,user_id,channel) values (${ORG},${userId},${channel}) on conflict (org_id,user_id) do update set channel = excluded.channel`
const connectSlack = async () => {
  const { saveSlackConnection } = await import("./slack-connection")
  if (!SLACK_ON.on) throw Error("switch")
  await saveSlackConnection({ orgId: ORG, userId: REQUESTER }, { token: TOKEN, teamId: "T1", teamName: "Acme" }, { tokenKey: SLACK_ON.tokenKey })
}

beforeAll(async () => {
  await connection`insert into organizations(id,name,slug) values (${ORG},'Acme','slack-delivery')`
  for (const id of [REQUESTER, REVIEWER, EMAILER]) await connection`insert into profiles(id,full_name,email) values (${id},${id},${id + "@example.test"})`
})
beforeEach(async () => {
  await connection`delete from delivery_preferences where org_id = ${ORG}`
  await connection`delete from slack_connections where org_id = ${ORG}`
  await connection`delete from requests where org_id = ${ORG} and status in ('open','in_progress')`
  await connection`delete from delivery_log where org_id = ${ORG}`
})
afterAll(() => connection.end())

/** One run's two stand-ins, and the token the Slack one was opened with. */
function standIns(slackDm: Messenger & { messages?: unknown[] } = recordingMessenger()) {
  const email = recordingMessenger()
  const tokens: string[] = []
  return { email, slack: slackDm as ReturnType<typeof recordingMessenger>, tokens, run: (slack: SlackDelivery = SLACK_ON) => ({ now: NOW, appUrl: APP, messenger: email, slack, slackMessenger: (token: string) => { tokens.push(token); return slackDm } }) }
}
const delivery = () => import("./inbox-delivery")
const links = (text: string) => text.match(/https?:\/\/[^\s>|]+/g) ?? []

describe("Slack DM while Slack is connected", () => {
  it("sends a Reviewer who chose Slack DM one DM for the review asked of them, linking to the Request, and no email", async () => {
    await connectSlack()
    await prefer(REVIEWER, "slack")
    const id = await request({ title: "Checkout drop-off", reviewers: [review(REVIEWER)] })
    const s = standIns()
    expect(await (await delivery()).deliverRequestNeedsYou({ orgId: ORG, requestId: id }, s.run())).toMatchObject({ sent: 1 })
    expect(s.email.messages).toEqual([])
    expect(s.tokens).toEqual([TOKEN])
    expect(s.slack.messages).toHaveLength(1)
    const [dm] = s.slack.messages
    expect(dm).toMatchObject({ channel: "slack", to: `${REVIEWER}@example.test` })
    expect(dm.text).toContain("Waiting for your review")
    expect(dm.text).toContain("Checkout drop-off")
    expect(links(dm.text)).toEqual([`${APP}/requests/${id}`])
    expect(await connection`select user_id, channel from delivery_log where request_id = ${id}`).toEqual([{ user_id: REVIEWER, channel: "slack" }])

    const again = standIns()
    await (await delivery()).deliverRequestNeedsYou({ orgId: ORG, requestId: id }, again.run())
    expect([...again.slack.messages, ...again.email.messages]).toEqual([])
  })

  it("sends Record the release and Result due from the daily job as one DM each, once", async () => {
    await connectSlack()
    await prefer(REQUESTER, "slack")
    const done = await request({ title: "Done a while ago", status: "done", doneAt: "2026-10-20T09:00:00Z" })
    const due = await request({ title: "Due today", status: "done", doneAt: "2026-10-01T09:00:00Z", releaseState: released("2026-10-28") })
    const s = standIns()
    await (await delivery()).runDailyDelivery(s.run())
    await (await delivery()).runDailyDelivery(s.run())
    const mine = s.slack.messages.filter(m => m.to === `${REQUESTER}@example.test`)
    expect(mine.map(m => links(m.text)[0]).sort()).toEqual([`${APP}/requests/${done}`, `${APP}/requests/${due}`].sort())
    expect(s.email.messages.filter(m => m.to === `${REQUESTER}@example.test`)).toEqual([])
  })

  it("leaves people who chose Email on email, and Off still gets Result due by email", async () => {
    await connectSlack()
    await prefer(REVIEWER, "slack")
    const id = await request({ title: "Two Reviewers", reviewers: [review(REVIEWER), review(EMAILER)] })
    const s = standIns()
    await (await delivery()).deliverRequestNeedsYou({ orgId: ORG, requestId: id }, s.run())
    expect(s.slack.messages.map(m => m.to)).toEqual([`${REVIEWER}@example.test`])
    expect(s.email.messages.map(m => m.to)).toEqual([`${EMAILER}@example.test`])

    await prefer(REQUESTER, "off")
    const due = await request({ title: "Off and due", status: "done", doneAt: "2026-10-01T09:00:00Z", releaseState: released("2026-10-27") })
    const daily = standIns()
    await (await delivery()).runDailyDelivery(daily.run())
    expect(daily.slack.messages).toEqual([])
    expect(daily.email.messages.filter(m => m.text.includes(due)).map(m => [m.to, links(m.text)])).toEqual([[`${REQUESTER}@example.test`, [`${APP}/requests/${due}`]]])
  })
})

describe("falling back to Email", () => {
  it("emails people who chose Slack DM once Slack is disconnected", async () => {
    await prefer(REVIEWER, "slack")
    const id = await request({ title: "Not connected", reviewers: [review(REVIEWER)] })
    const s = standIns()
    await (await delivery()).deliverRequestNeedsYou({ orgId: ORG, requestId: id }, s.run())
    expect(s.slack.messages).toEqual([])
    expect(s.tokens).toEqual([])
    expect(s.email.messages.map(m => [m.channel, m.to, links(m.text)])).toEqual([["email", `${REVIEWER}@example.test`, [`${APP}/requests/${id}`]]])
    expect(await connection`select channel from delivery_log where request_id = ${id}`).toEqual([{ channel: "email" }])
  })

  it("emails them while Slack is switched off, even with a connection saved", async () => {
    await connectSlack()
    await prefer(REVIEWER, "slack")
    const id = await request({ title: "Switched off", reviewers: [review(REVIEWER)] })
    const s = standIns()
    await (await delivery()).deliverRequestNeedsYou({ orgId: ORG, requestId: id }, s.run(SLACK_OFF))
    expect(s.slack.messages).toEqual([])
    expect(s.email.messages.map(m => m.to)).toEqual([`${REVIEWER}@example.test`])
  })

  it("emails someone the connected Slack can't find, once, instead of a DM", async () => {
    await connectSlack()
    await prefer(REVIEWER, "slack")
    const id = await request({ title: "Not in Slack", reviewers: [review(REVIEWER)] })
    const s = standIns({ outcome: "sent", send: async () => ({ ok: false, reason: "slack_users_not_found", useEmail: true }) })
    expect(await (await delivery()).deliverRequestNeedsYou({ orgId: ORG, requestId: id }, s.run())).toMatchObject({ sent: 1, failed: 0 })
    expect(s.email.messages.map(m => m.to)).toEqual([`${REVIEWER}@example.test`])
    expect(await connection`select channel from delivery_log where request_id = ${id}`).toEqual([{ channel: "email" }])
  })

  it("keeps a passing Slack outage for a later run on Slack, not email", async () => {
    await connectSlack()
    await prefer(REQUESTER, "slack")
    const due = await request({ title: "Slack down", status: "done", doneAt: "2026-10-01T09:00:00Z", releaseState: released("2026-10-28") })
    const down = standIns({ outcome: "sent", send: async () => ({ ok: false, reason: "slack_503" }) })
    expect((await (await delivery()).runDailyDelivery(down.run())).failed).toBeGreaterThan(0)
    expect(down.email.messages.filter(m => m.text.includes(due))).toEqual([])
    expect(await connection`select 1 from delivery_log where request_id = ${due}`).toEqual([])
    const back = standIns()
    await (await delivery()).runDailyDelivery(back.run())
    expect(back.slack.messages.filter(m => m.text.includes(due))).toHaveLength(1)
  })
})
