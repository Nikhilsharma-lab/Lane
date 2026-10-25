/**
 * #206 seam 4: delivery, with the messenger swapped for the recording stand-in. Needs-you items leave Lane one
 * message per item, once: action-caused items (a review asked, a Concern raised) when the action happens,
 * time-caused ones (Record the release, Result due) from the daily job. Real database, a mocked Clerk roster and
 * a controlled `now`; nothing touches the network.
 */
import { randomUUID } from "node:crypto"
import postgres from "postgres"
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { TEST_DATABASE_PATH } from "@/test/test-database"
import { recordingMessenger, type Messenger } from "./messenger"
import type { ReleaseFact } from "./request-release"

const ORG = "org_inbox_delivery"
const OTHER_ORG = "org_inbox_delivery_quiet"
const REQUESTER = "delivery_requester"
const REVIEWER = "delivery_reviewer"
const GUEST = "delivery_guest"
const SECOND_REQUESTER = "delivery_second_requester"

/** The live Clerk roster: who is in the workspace, with which role. A Guest is filtered out like any non-member. */
const roster = vi.hoisted(() => new Map<string, string>())
vi.mock("@clerk/nextjs/server", () => ({
  auth: vi.fn(async () => ({ userId: null })),
  clerkClient: async () => ({
    organizations: {
      getOrganizationMembershipList: async ({ organizationId }: { organizationId: string }) => {
        const members = organizationId === ORG ? [...roster] : []
        return {
          totalCount: members.length,
          data: members.map(([userId, role]) => ({ organization: { id: organizationId }, role, publicUserData: { userId, identifier: `${userId}@example.test`, firstName: userId } })),
        }
      },
    },
  }),
}))

const url = new URL(process.env.DATABASE_URL!)
if (!TEST_DATABASE_PATH.test(url.pathname) || !["localhost", "127.0.0.1"].includes(url.hostname)) throw Error("Local test DB only")
const connection = postgres(url.toString(), { max: 1, prepare: false, onnotice: () => {} })
const APP = "https://lane.example.test"
const NOW = new Date("2026-10-28T12:00:00Z")
const fingerprint = "d".repeat(64)

const fact = (dueDate: string): ReleaseFact => ({ exposureDate: "2026-10-01", audience: "All shoppers", evidence: "Rollout log", dueDate, startDate: "2026-10-01", windowKind: "relative" })
const released = (dueDate: string, ownerId = REQUESTER) => ({ version: 1, ownerId, release: fact(dueDate), history: [{ operationId: randomUUID(), fingerprint, actorId: ownerId, at: "2026-10-02T00:00:00Z", input: { kind: "release" }, previousRelease: null, release: fact(dueDate), previousOwnerId: ownerId, ownerId, revision: 1 }] })
const review = (userId: string, decision: { kind: string; reason: string; at: string } | null = null, note = "") =>
  ({ id: randomUUID(), nominee: { kind: "member", userId }, displayNameAtSelection: userId === REVIEWER ? "Ravi" : userId, addedBy: REQUESTER, note, decision: decision && { ...decision, actorId: userId } })

async function request(values: { title: string; createdBy?: string; status?: string; doneAt?: string; releaseState?: unknown; reviewers?: unknown[]; org?: string }) {
  const org = values.org ?? ORG
  const [{ id }] = await connection`insert into requests(org_id,title,description,created_by,status,done_at,release_state)
    values (${org},${values.title},'Fixture',${values.createdBy ?? REQUESTER},${values.status ?? "open"},${values.doneAt ?? null},
      ${values.releaseState ? connection.json(values.releaseState as never) : null}) returning id`
  if (values.reviewers) await connection`insert into request_agreements(request_id,org_id,reviewers) values (${id},${org},${connection.json(values.reviewers as never)})`
  return id as string
}
const prefer = (userId: string, channel: string) =>
  connection`insert into delivery_preferences(org_id,user_id,channel) values (${ORG},${userId},${channel}) on conflict (org_id,user_id) do update set channel = excluded.channel`

beforeAll(async () => {
  for (const [id, name] of [[ORG, "Acme"], [OTHER_ORG, "Quiet"]]) await connection`insert into organizations(id,name,slug) values (${id},${name},${id.replaceAll("_", "-")})`
  for (const id of [REQUESTER, REVIEWER, GUEST, SECOND_REQUESTER]) await connection`insert into profiles(id,full_name,email) values (${id},${id},${id + "@example.test"})`
})
beforeEach(async () => {
  roster.clear()
  for (const id of [REQUESTER, REVIEWER, SECOND_REQUESTER]) roster.set(id, "org:member")
  roster.set(GUEST, "org:guest")
  await connection`delete from delivery_preferences where org_id = ${ORG}`
  // Each case starts from Requests no one has been sent anything about.
  await connection`delete from requests where org_id in (${ORG}, ${OTHER_ORG}) and status in ('open','in_progress')`
  await connection`delete from delivery_log where org_id in (${ORG}, ${OTHER_ORG})`
})
// Released Requests keep their history (it cannot be deleted); the database is rebuilt every run.
afterAll(() => connection.end())

const delivery = () => import("./inbox-delivery")
const sendFor = async (requestId: string, messenger: Messenger = recordingMessenger()) =>
  (await delivery()).deliverRequestNeedsYou({ orgId: ORG, requestId }, { now: NOW, messenger, appUrl: APP })
const daily = async (messenger: Messenger, now = NOW) => (await delivery()).runDailyDelivery({ now, messenger, appUrl: APP })
const links = (text: string) => text.match(/https?:\/\/\S+/g) ?? []

describe("action-caused items: sent when the action happens", () => {
  it("emails a Reviewer once about the review asked of them, with one link to the Request", async () => {
    const id = await request({ title: "Checkout drop-off", reviewers: [review(REVIEWER, null, "Is the copy right?")] })
    const messenger = recordingMessenger()
    expect(await sendFor(id, messenger)).toMatchObject({ sent: 1 })
    expect(messenger.messages).toHaveLength(1)
    const [message] = messenger.messages
    expect(message).toMatchObject({ channel: "email", to: `${REVIEWER}@example.test` })
    expect(message.subject).toContain("Waiting for your review")
    expect(message.subject).toContain("Checkout drop-off")
    expect(message.text).toContain("Is the copy right?")
    expect(links(message.text)).toEqual([`${APP}/requests/${id}`])

    const again = recordingMessenger()
    expect(await sendFor(id, again)).toMatchObject({ sent: 0 })
    expect(again.messages).toEqual([])
  })

  it("emails the Requester once about a Concern raised on their Request", async () => {
    const id = await request({ title: "Wrong date", reviewers: [review(REVIEWER, { kind: "concern", reason: "The date is a week out", at: "2026-10-28T11:00:00.000Z" })] })
    const messenger = recordingMessenger()
    await sendFor(id, messenger)
    expect(messenger.messages.map(m => m.to)).toEqual([`${REQUESTER}@example.test`])
    expect(messenger.messages[0].subject).toContain("Ravi raised a concern")
    expect(messenger.messages[0].text).toContain("The date is a week out")
    await sendFor(id, messenger)
    expect(messenger.messages).toHaveLength(1)
  })

  it("never bundles: two Reviewers asked at once each get their own message, and so does each Request", async () => {
    const one = await request({ title: "First", reviewers: [review(REVIEWER), review(SECOND_REQUESTER)] })
    const two = await request({ title: "Second", reviewers: [review(REVIEWER)] })
    const messenger = recordingMessenger()
    await sendFor(one, messenger)
    await sendFor(two, messenger)
    expect(messenger.messages).toHaveLength(3)
    expect(messenger.messages.map(m => [m.to, links(m.text)])).toEqual(expect.arrayContaining([
      [`${REVIEWER}@example.test`, [`${APP}/requests/${one}`]],
      [`${SECOND_REQUESTER}@example.test`, [`${APP}/requests/${one}`]],
      [`${REVIEWER}@example.test`, [`${APP}/requests/${two}`]],
    ]))
  })

  it("respects Off for a review and a Concern", async () => {
    await prefer(REVIEWER, "off")
    await prefer(REQUESTER, "off")
    const id = await request({ title: "Quiet", reviewers: [review(REVIEWER), review(SECOND_REQUESTER, { kind: "concern", reason: "No", at: "2026-10-28T11:00:00.000Z" })] })
    const messenger = recordingMessenger()
    await sendFor(id, messenger)
    expect(messenger.messages).toEqual([])
  })

  it("sends nothing to someone who left the workspace or is not a Member or Admin", async () => {
    roster.delete(REVIEWER)
    const id = await request({ title: "Left", createdBy: GUEST, reviewers: [review(REVIEWER), review(SECOND_REQUESTER, { kind: "concern", reason: "No", at: "2026-10-28T11:00:00.000Z" })] })
    const messenger = recordingMessenger()
    await sendFor(id, messenger)
    expect(messenger.messages).toEqual([])
  })

  it("never emails For-your-information items", async () => {
    const id = await request({ title: "Commented" })
    await connection`insert into notifications(user_id,org_id,type,request_id,actor_id) values (${REQUESTER},${ORG},'comment_added',${id},${REVIEWER})`
    await connection`insert into notifications(user_id,org_id,type,request_id,actor_id) values (${REQUESTER},${ORG},'review_looks_good',${id},${REVIEWER})`
    const messenger = recordingMessenger()
    await sendFor(id, messenger)
    await daily(messenger)
    expect(messenger.messages.filter(m => m.text.includes(id))).toEqual([])
  })

  it("records each delivery with the stand-in's outcome, and releases a failed send so it can go later", async () => {
    const id = await request({ title: "Flaky", reviewers: [review(REVIEWER)] })
    const failing: Messenger = { outcome: "sent", send: async () => ({ ok: false, reason: "provider_500" }) }
    expect(await sendFor(id, failing)).toMatchObject({ sent: 0, failed: 1 })
    expect(await connection`select 1 from delivery_log where request_id = ${id}`).toEqual([])
    await sendFor(id)
    expect(await connection`select user_id, channel, outcome from delivery_log where request_id = ${id}`).toEqual([{ user_id: REVIEWER, channel: "email", outcome: "would_send" }])
  })
})

describe("time-caused items: the daily job", () => {
  it("sends Record the release and Result due once each, however often it runs", async () => {
    const done = await request({ title: "Done five days ago", status: "done", doneAt: "2026-10-23T09:00:00Z" })
    const due = await request({ title: "Due today", status: "done", doneAt: "2026-10-01T09:00:00Z", releaseState: released("2026-10-28") })
    await request({ title: "Done yesterday", status: "done", doneAt: "2026-10-27T09:00:00Z" })
    await request({ title: "Due next week", status: "done", doneAt: "2026-10-01T09:00:00Z", releaseState: released("2026-11-04") })
    const messenger = recordingMessenger()
    await daily(messenger)
    const mine = () => messenger.messages.filter(m => m.to === `${REQUESTER}@example.test`)
    expect(mine().map(m => links(m.text)[0]).sort()).toEqual([`${APP}/requests/${done}`, `${APP}/requests/${due}`].sort())
    expect(mine().find(m => m.text.includes(due))!.subject).toContain("Result due")
    expect(mine().find(m => m.text.includes(done))!.subject).toContain("Record the release")

    await daily(messenger)
    await daily(messenger, new Date("2026-10-29T12:00:00Z"))
    expect(mine()).toHaveLength(2)
  })

  it("leaves action-caused items to the action", async () => {
    await request({ title: "Asked earlier", reviewers: [review(REVIEWER)] })
    const messenger = recordingMessenger()
    await daily(messenger)
    expect(messenger.messages.filter(m => m.to === `${REVIEWER}@example.test`)).toEqual([])
  })

  it("respects Off for Record the release but still sends Result due", async () => {
    await prefer(SECOND_REQUESTER, "off")
    await request({ title: "Off and Done", createdBy: SECOND_REQUESTER, status: "done", doneAt: "2026-10-20T09:00:00Z" })
    const due = await request({ title: "Off and due", createdBy: SECOND_REQUESTER, status: "done", doneAt: "2026-10-01T09:00:00Z", releaseState: released("2026-10-27", SECOND_REQUESTER) })
    const messenger = recordingMessenger()
    await daily(messenger)
    const theirs = messenger.messages.filter(m => m.to === `${SECOND_REQUESTER}@example.test`)
    expect(theirs.map(m => links(m.text))).toEqual([[`${APP}/requests/${due}`]])
    expect(theirs[0].subject).toContain("Result due")
  })

  it("sends nothing to a Guest Requester or to a workspace with no members on the roster", async () => {
    await request({ title: "Guest's own", createdBy: GUEST, status: "done", doneAt: "2026-10-01T09:00:00Z" })
    await request({ title: "Quiet workspace", org: OTHER_ORG, status: "done", doneAt: "2026-10-01T09:00:00Z" })
    const messenger = recordingMessenger()
    await daily(messenger)
    expect(messenger.messages.filter(m => m.to === `${GUEST}@example.test` || m.text.includes("Quiet workspace"))).toEqual([])
  })
})
