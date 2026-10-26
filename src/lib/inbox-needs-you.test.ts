/**
 * #205: Needs-you items through the Inbox's own reads (GET /api/notifications and the bell's
 * GET /api/notifications/unread) on the real database and a controlled clock. The rules themselves are pinned
 * by the pure read model's tests; these prove the loader hands it the right records and the bell counts them.
 */
import { randomUUID } from "node:crypto"
import postgres from "postgres"
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest"
import { GET as inboxList } from "@/app/api/notifications/route"
import { GET as inboxCount } from "@/app/api/notifications/unread/route"
import { TEST_DATABASE_PATH } from "@/test/test-database"
import type { ReleaseFact } from "./request-release"

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
const session = vi.hoisted(() => ({ current: { userId: "", orgId: "", orgRole: "" } }))
vi.mock("@clerk/nextjs/server", () => ({ auth: vi.fn(async () => session.current) }))

const url = new URL(process.env.DATABASE_URL!)
if (!TEST_DATABASE_PATH.test(url.pathname) || !["localhost", "127.0.0.1"].includes(url.hostname)) throw Error("Local test DB only")
const connection = postgres(url.toString(), { max: 1, prepare: false, onnotice: () => {} })
const orgId = "org_inbox_needs_you"
const otherOrg = "org_inbox_needs_you_other"
const requester = "needs_you_requester"
const reviewer = "needs_you_reviewer"
const former = "needs_you_former"
const guest = "needs_you_guest"
const fingerprint = "c".repeat(64)

const fact = (dueDate: string): ReleaseFact => ({ exposureDate: "2026-10-01", audience: "All shoppers", evidence: "Rollout log", dueDate, startDate: "2026-10-01", windowKind: "relative" })
const event = (kind: string, previousRelease: ReleaseFact | null, release: ReleaseFact | null, previousOwnerId: string, ownerId: string, at = "2026-10-02T00:00:00Z") =>
  ({ operationId: randomUUID(), fingerprint, actorId: previousOwnerId, at, input: { kind }, previousRelease, release, previousOwnerId, ownerId, revision: 1 })
const handedOver = (dueDate: string) => ({ version: 1, ownerId: requester, release: fact(dueDate), history: [event("release", null, fact(dueDate), former, former), event("transfer", fact(dueDate), fact(dueDate), former, requester)] })
const review = (userId: string, decision: { kind: string; reason: string; at: string } | null, note = "") =>
  ({ id: randomUUID(), nominee: { kind: "member", userId }, displayNameAtSelection: userId === reviewer ? "Ravi" : userId, addedBy: requester, note, decision: decision && { ...decision, actorId: userId } })

const today = new Date("2026-10-28T12:00:00Z")
let askedId: string
let concernId: string

async function request(values: { title: string; org?: string; createdBy?: string; status?: string; doneAt?: string; releaseState?: unknown }) {
  const [{ id }] = await connection`insert into requests(org_id,title,description,created_by,status,done_at,release_state)
    values (${values.org ?? orgId},${values.title},'Fixture',${values.createdBy ?? requester},${values.status ?? "open"},${values.doneAt ?? null},
      ${values.releaseState ? connection.json(values.releaseState as never) : null}) returning id`
  return id as string
}

beforeAll(async () => {
  for (const [id, name] of [[orgId, "Needs you"], [otherOrg, "Needs you other"]]) await connection`insert into organizations(id,name,slug) values (${id},${name},${id.replaceAll("_", "-")})`
  for (const id of [requester, reviewer, former, guest]) await connection`insert into profiles(id,full_name,email) values (${id},${id},${id + "@example.test"})`
  askedId = await request({ title: "Asked to review" })
  await connection`insert into request_agreements(request_id,org_id,reviewers) values (${askedId},${orgId},${connection.json([review(reviewer, null, "Is the copy right?")])})`
  await connection`insert into notifications(user_id,org_id,type,request_id,actor_id,created_at) values (${reviewer},${orgId},'review_requested',${askedId},${requester},'2026-10-27T08:00:00Z')`
  concernId = await request({ title: "Concern raised" })
  await connection`insert into request_agreements(request_id,org_id,reviewers) values (${concernId},${orgId},${connection.json([review(reviewer, { kind: "concern", reason: "Wrong date", at: "2026-10-27T09:00:00.000Z" })])})`
  await request({ title: "Done five days ago", status: "done", doneAt: "2026-10-23T09:00:00Z" })
  await request({ title: "Done yesterday", status: "done", doneAt: "2026-10-27T09:00:00Z" })
  await request({ title: "Handed over, due", createdBy: former, status: "done", doneAt: "2026-10-01T09:00:00Z", releaseState: handedOver("2026-10-20") })
  await request({ title: "In progress", status: "in_progress" })
  await request({ title: "Guest's own, Done long ago", createdBy: guest, status: "done", doneAt: "2026-10-01T09:00:00Z" })
  await request({ title: "Another workspace", org: otherOrg, status: "done", doneAt: "2026-10-01T09:00:00Z" })
})
afterEach(() => vi.useRealTimers())
// The test database is rebuilt every run, and release history cannot be deleted, so fixtures stay.
afterAll(() => connection.end())

const as = (userId: string, orgRole = "org:member") => { session.current = { userId, orgId, orgRole } }
const at = (date: Date) => { vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(date) }
async function counts() {
  const response = await inboxCount(new Request(`http://lane.test/api/notifications/unread?org=${orgId}`))
  expect(response.status).toBe(200)
  return (await response.json()) as { count: number; unread: number }
}
async function needsYou() {
  const response = await inboxList(new Request(`http://lane.test/api/notifications?org=${orgId}`))
  expect(response.status).toBe(200)
  const body = (await response.json()) as { needsYou: { kind: string; requestTitle: string; detail: string | null; reviewerName: string | null; since: string }[] }
  return body.needsYou.map(item => `${item.kind}: ${item.requestTitle}`).sort()
}

describe("Needs you, through the Inbox's reads", () => {
  it("gives the Requester their Concern, Record the release and Result due, and the bell counts exactly those", async () => {
    at(today)
    as(requester)
    expect(await needsYou()).toEqual(["concern: Concern raised", "record_release: Done five days ago", "result_due: Handed over, due"])
    expect((await counts()).count).toBe(3)
  })

  it("gives the Reviewer the review asked of them, dated from the ask, with its question", async () => {
    at(today)
    as(reviewer)
    const response = await inboxList(new Request(`http://lane.test/api/notifications?org=${orgId}`))
    const { needsYou } = await response.json()
    expect(needsYou).toEqual([expect.objectContaining({ kind: "review", requestId: askedId, requestTitle: "Asked to review", detail: "Is the copy right?", since: "2026-10-27T08:00:00.000Z" })])
    expect((await counts()).count).toBe(1)
  })

  it("clears a review once it is answered, and the Concern once the answer changes", async () => {
    at(today)
    await connection`update request_agreements set reviewers = jsonb_set(reviewers, '{0,decision}', ${connection.json({ kind: "looks_good", actorId: reviewer, at: "2026-10-28T10:00:00.000Z", reason: "" })}) where request_id in (${askedId}, ${concernId})`
    as(reviewer)
    expect(await needsYou()).toEqual([])
    as(requester)
    expect(await needsYou()).toEqual(["record_release: Done five days ago", "result_due: Handed over, due"])
  })

  it("leaves the former Requester nothing after a handover", async () => {
    at(today)
    as(former)
    expect(await needsYou()).toEqual([])
    expect((await counts()).count).toBe(0)
  })

  it("gives a Guest no Needs-you items, even on their own submission", async () => {
    at(today)
    as(guest, "org:guest")
    expect(await needsYou()).toEqual([])
    expect((await counts()).count).toBe(0)
  })

  it("counts only Needs-you items on the bell, with For-your-information unread counted apart", async () => {
    at(today)
    await connection`insert into notifications(user_id,org_id,type,request_id,actor_id) values (${requester},${orgId},'comment_added',${askedId},${reviewer})`
    as(requester)
    expect(await counts()).toEqual({ count: 2, unread: 1 })
  })

  it("stores nothing when the bell is checked", async () => {
    at(new Date("2026-12-01T12:00:00Z"))
    const before = await connection`select count(*)::int as n from notifications where org_id = ${orgId}`
    for (const person of [requester, reviewer, former]) { as(person); await counts(); await needsYou() }
    expect(await connection`select count(*)::int as n from notifications where org_id = ${orgId}`).toEqual(before)
  })
})
