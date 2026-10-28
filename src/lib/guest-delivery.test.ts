/**
 * #212 seam 4: the Guest's two emails, through #206's delivery module with the recording stand-in. A Guest hears
 * exactly twice about their submission: when a Member takes it on and when it is Closed, whatever their delivery
 * choice, and nothing else ever. Real database, mocked Clerk, `after` run by the test; nothing touches the network.
 */
import { randomUUID } from "node:crypto"
import postgres from "postgres"
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { requireTestDatabase } from "@/test/test-database"
import { recordingMessenger } from "./messenger"

const ORG = "org_guest_delivery"
const [GUEST, MEMBER, REVIEWER] = ["guest_delivery_guest", "guest_delivery_member", "guest_delivery_reviewer"]
const APP = "https://lane.example.test"

const session = vi.hoisted(() => ({ userId: "guest_delivery_member", orgId: "org_guest_delivery", orgRole: "org:member" }))
/** The live Clerk roster: who is in the workspace, with which role. */
const roster = vi.hoisted(() => new Map<string, string>())
/** Work `after()` scheduled during an action; the test runs it as the response would finish. */
const scheduled = vi.hoisted(() => [] as (() => Promise<unknown> | unknown)[])
/** Every message the stand-in accepted, across runs the actions start themselves. */
const sent = vi.hoisted(() => [] as { to: string; subject: string; text: string }[])
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
vi.mock("next/server", async (original) => ({ ...(await original<typeof import("next/server")>()), after: (work: () => unknown) => { scheduled.push(work) } }))
vi.mock("./feature-switches", async (original) => ({ ...(await original<typeof import("./feature-switches")>()), appOrigin: () => "https://lane.example.test" }))
vi.mock("./messenger", async (original) => {
  const real = await original<typeof import("./messenger")>()
  // The switches pick the stand-in while email is off; this one also keeps what it was given for the test.
  return { ...real, recordingMessenger: () => { const messenger = real.recordingMessenger(); return { ...messenger, send: async (message: { to: string; subject: string; text: string }) => { sent.push(message); return messenger.send(message as never) } } } }
})
vi.mock("@clerk/nextjs/server", () => ({
  auth: async () => ({ ...session }),
  clerkClient: async () => ({
    organizations: {
      getOrganizationMembershipList: async ({ userId }: { userId?: string[] } = {}) => {
        const people = [...roster].filter(([id]) => !userId || userId.includes(id))
        return { totalCount: people.length, data: people.map(([id, role]) => ({ organization: { id: ORG }, role, publicUserData: { userId: id, identifier: `${id}@example.test`, firstName: id } })) }
      },
      getOrganizationInvitationList: async () => ({ totalCount: 0, data: [] }),
    },
  }),
}))

const url = new URL(process.env.DATABASE_URL!)
requireTestDatabase(process.env.DATABASE_URL);
const connection = postgres(url.toString(), { max: 2, prepare: false, onnotice: () => {} })

beforeAll(async () => {
  await connection`insert into organizations(id,name,slug) values (${ORG},'Acme','guest-delivery')`
  for (const id of [GUEST, MEMBER, REVIEWER]) await connection`insert into profiles(id,full_name,email) values (${id},${"Name " + id},${id + "@example.test"})`
})
beforeEach(async () => {
  roster.clear()
  roster.set(GUEST, "org:guest").set(MEMBER, "org:member").set(REVIEWER, "org:member")
  scheduled.length = 0
  sent.length = 0
  session.userId = MEMBER
  session.orgRole = "org:member"
  await connection`delete from delivery_preferences where org_id = ${ORG}`
})
// Closed Requests can't be deleted; the database is rebuilt every run.
afterAll(() => connection.end())

const delivery = () => import("./inbox-delivery")
const respond = async () => { for (const work of scheduled.splice(0)) await work() }
const guestEmails = () => sent.filter((message) => message.to === `${GUEST}@example.test`)
const logged = (id: string) => connection`select user_id, item_key, outcome from delivery_log where request_id=${id} order by sent_at`

async function submission(values: { takenOn?: boolean; closed?: boolean; guestSubmission?: boolean } = {}) {
  const guestSubmission = values.guestSubmission ?? true
  const [row] = await connection`insert into requests(org_id,title,description,created_by,guest_submission,taken_on_by,taken_on_at)
    values (${ORG},'Dark mode for the dashboard','The dashboard is too bright at night.',${GUEST},${guestSubmission},${values.takenOn ? MEMBER : null},${values.takenOn ? new Date() : null}) returning id`
  return row.id as string
}
const send = async (requestId: string, kind: "taken_on" | "closed", messenger = recordingMessenger()) => {
  const report = await (await delivery()).deliverGuestEmail({ orgId: ORG, requestId, kind }, { messenger, appUrl: APP, now: new Date("2026-10-25T12:00:00Z") })
  return { report, messages: messenger.messages }
}

describe("the taken-on email", () => {
  it("goes to the Guest once, with one link to their Request, even when their delivery choice is Off", async () => {
    const id = await submission({ takenOn: true })
    await connection`insert into delivery_preferences(org_id,user_id,channel) values (${ORG},${GUEST},'off')`
    const first = await send(id, "taken_on")
    expect(first.report).toEqual({ sent: 1, skipped: 0, failed: 0 })
    expect(first.messages).toHaveLength(1)
    const [message] = first.messages
    expect(message).toMatchObject({ channel: "email", to: `${GUEST}@example.test` })
    expect(message.subject).toContain("Name guest_delivery_member took on your Request")
    expect(message.text).toContain("Dark mode for the dashboard")
    expect(message.text.match(/https?:\/\/\S+/g)).toEqual([`${APP}/requests/${id}`])
    expect(await send(id, "taken_on")).toMatchObject({ report: { sent: 0, skipped: 1, failed: 0 }, messages: [] })
    expect(await logged(id)).toEqual([{ user_id: GUEST, item_key: `guest_taken_on:${id}`, outcome: "would_send" }])
  })

  it("sends nothing while the submission waits, or for a Request a Guest didn't submit", async () => {
    expect((await send(await submission(), "taken_on")).messages).toEqual([])
    expect((await send(await submission({ guestSubmission: false }), "taken_on")).messages).toEqual([])
  })

  it("sends nothing to someone who has left the workspace or is now a Viewer", async () => {
    const id = await submission({ takenOn: true })
    roster.delete(GUEST)
    expect((await send(id, "taken_on")).messages).toEqual([])
    roster.set(GUEST, "org:viewer")
    expect((await send(id, "taken_on")).messages).toEqual([])
    expect(await logged(id)).toEqual([])
  })
})

describe("the closed email", () => {
  it("goes once, only after the Request is Closed", async () => {
    const id = await submission({ takenOn: true })
    expect((await send(id, "closed")).messages).toEqual([])
    await connection`update requests set status='in_progress' where id=${id}`
    const exception = { version: 1, kind: "exception", reasonCode: "rolled_back", reason: "", actorId: MEMBER, ownerId: MEMBER, closedAt: "2026-10-25T00:00:00Z", operationId: randomUUID(), fingerprint: "e".repeat(64), release: null, revision: 1 }
    await connection`update requests set exception_closure=${connection.json(exception)}, agreement_revision=1 where id=${id}`
    const closed = await send(id, "closed")
    expect(closed.messages).toHaveLength(1)
    expect(closed.messages[0].subject).toContain("Your Request is Closed")
    expect(closed.messages[0].text).toContain("Closed without a result")
    expect((await send(id, "closed")).messages).toEqual([])
  })
})

describe("exactly two emails, through the actions", () => {
  it("a Guest hears when it's taken on and when it's Closed, and about nothing in between", async () => {
    const id = await submission()
    const revision = async () => (await connection`select agreement_revision from requests where id=${id}`)[0].agreement_revision as number
    const change = async () => ({ orgId: ORG, requestId: id, expectedRevision: await revision(), operationId: randomUUID() })
    const { takeOnGuestSubmission } = await import("@/app/(app)/requests/[id]/take-on-actions")
    const { addReviewers } = await import("@/app/(app)/requests/[id]/reviewer-actions")
    const { pickUpRequest } = await import("@/app/(app)/requests/[id]/actions")
    const { changeRequestOutcome } = await import("@/app/(app)/requests/[id]/outcome-actions")
    expect(await takeOnGuestSubmission(await change())).toMatchObject({ success: true })
    await respond()
    expect(guestEmails().map((message) => message.subject)).toEqual([expect.stringContaining("took on your Request")])
    // The Member asks a Reviewer, writes the prediction and starts the work: none of it reaches the Guest.
    expect(await addReviewers(await change(), { nominees: [{ kind: "member", userId: REVIEWER }], note: "" })).toMatchObject({ success: true })
    await connection`update requests set no_measurable_impact_reason='Housekeeping' where id=${id}`
    expect(await pickUpRequest(id, { orgId: ORG })).toMatchObject({ success: true })
    expect(await changeRequestOutcome(await change(), { kind: "exception", reasonCode: "other", reason: "Done another way" })).toMatchObject({ success: true })
    await respond()
    await (await delivery()).runDailyDelivery({ now: new Date("2026-12-01T00:00:00Z"), appUrl: APP })
    expect(guestEmails().map((message) => message.subject)).toEqual([expect.stringContaining("took on your Request"), expect.stringContaining("Your Request is Closed")])
    // A Correction afterwards sends nothing more.
    expect(await changeRequestOutcome(await change(), { kind: "correction", field: "reason", correction: "Done another way, by the support team", reason: "Clearer" })).toMatchObject({ success: true })
    await respond()
    expect(guestEmails()).toHaveLength(2)
  })
})
