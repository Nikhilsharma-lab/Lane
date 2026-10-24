import { requireTestDatabase } from "@/test/test-database";
/**
 * #136: bell reminders are written when the bell count loads (no scheduled job). Proven through the bell's
 * own reads (GET /api/notifications/unread and GET /api/notifications) on a controlled clock.
 */
import { randomUUID } from "node:crypto"
import postgres from "postgres"
import { afterAll, afterEach, beforeAll, expect, it, vi } from "vitest"
import { GET as notificationList } from "@/app/api/notifications/route"
import { GET as unreadCount } from "@/app/api/notifications/unread/route"
import type { ReleaseFact } from "./request-release"

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
const session = vi.hoisted(() => ({ current: { userId: "", orgId: "", orgRole: "" } }))
vi.mock("@clerk/nextjs/server", () => ({ auth: vi.fn(async () => session.current) }))

const connection = postgres(requireTestDatabase(process.env.DATABASE_URL).url, { max: 1, prepare: false })
const orgId = "org_bell_reminders"
const otherOrg = "org_bell_reminders_other"
const requester = "bell_requester"
const assignee = "bell_assignee"
const former = "bell_former_requester"
const guest = "bell_guest"
const fingerprint = "b".repeat(64)

const fact = (dueDate: string): ReleaseFact => ({ exposureDate: "2026-10-01", audience: "All shoppers", evidence: "Rollout log", dueDate, startDate: "2026-10-01", windowKind: "relative" })
const event = (kind: string, previousRelease: ReleaseFact | null, release: ReleaseFact | null, previousOwnerId: string, ownerId: string) =>
  ({ operationId: randomUUID(), fingerprint, actorId: previousOwnerId, at: "2026-10-02T00:00:00Z", input: { kind }, previousRelease, release, previousOwnerId, ownerId, revision: 1 })
const released = (dueDate: string, owner = requester) => ({ version: 1, ownerId: owner, release: fact(dueDate), history: [event("release", null, fact(dueDate), owner, owner)] })
const handedOver = (dueDate: string) => ({ version: 1, ownerId: requester, release: fact(dueDate), history: [event("release", null, fact(dueDate), former, former), event("transfer", fact(dueDate), fact(dueDate), former, requester)] })
const voided = { version: 1, ownerId: requester, release: null, history: [event("release", null, fact("2026-10-20"), requester, requester), event("void", fact("2026-10-20"), null, requester, requester)] }
const measured = (release: ReleaseFact) => ({ version: 1, kind: "measured", actorId: requester, ownerId: requester, closedAt: "2026-10-28T00:00:00Z", operationId: randomUUID(), fingerprint, expected: { kind: "metric" }, release, primary: { kind: "pass_fail", passed: true }, guardrails: [], evidence: "Dashboard", observedFrom: "2026-10-01", observedTo: "2026-10-20", revision: 1 })

const today = new Date("2026-10-28T12:00:00Z")
type Fixture = { title: string; org?: string; createdBy?: string; assignedTo?: string; status: string; doneAt?: string; releaseState?: unknown; outcomeClosure?: unknown }
const fixtures: Fixture[] = [
  { title: "Done five days ago", status: "done", assignedTo: assignee, doneAt: "2026-10-23T09:00:00Z" },
  { title: "Measuring, due today", status: "done", assignedTo: assignee, doneAt: "2026-10-01T09:00:00Z", releaseState: released("2026-10-28") },
  { title: "Measuring, handed over, overdue", createdBy: former, status: "done", assignedTo: assignee, doneAt: "2026-10-01T09:00:00Z", releaseState: handedOver("2026-10-20") },
  { title: "Closed, overdue release", status: "done", assignedTo: assignee, doneAt: "2026-10-01T09:00:00Z", releaseState: released("2026-10-20"), outcomeClosure: measured(fact("2026-10-20")) },
  { title: "Done, release voided", status: "done", assignedTo: assignee, doneAt: "2026-10-01T09:00:00Z", releaseState: voided },
  { title: "Done by a guest", status: "done", assignedTo: guest, doneAt: "2026-10-01T09:00:00Z" },
  { title: "Guest's own, due today", createdBy: guest, status: "done", assignedTo: assignee, doneAt: "2026-10-01T09:00:00Z", releaseState: released("2026-10-28", guest) },
  { title: "Another workspace", org: otherOrg, status: "done", assignedTo: assignee, doneAt: "2026-10-01T09:00:00Z" },
]

const as = (userId: string, orgRole = "org:member") => { session.current = { userId, orgId, orgRole } }
async function count() {
  const response = await unreadCount(new Request(`http://lane.test/api/notifications/unread?org=${orgId}`))
  expect(response.status).toBe(200)
  return ((await response.json()) as { count: number }).count
}
async function reminders() {
  const response = await notificationList(new Request(`http://lane.test/api/notifications?org=${orgId}`))
  expect(response.status).toBe(200)
  const { notifications } = (await response.json()) as { notifications: { type: string; requestTitle: string; actorId: string | null }[] }
  return notifications.filter(n => n.actorId === null).map(n => `${n.type}: ${n.requestTitle}`).sort()
}
const written = async () => (await connection`select user_id, type, r.title from notifications n join requests r on r.id = n.request_id where n.org_id in (${orgId}, ${otherOrg}) and actor_id is null order by 1, 2, 3`).map(r => `${r.user_id} ${r.type}: ${r.title}`)

beforeAll(async () => {
  for (const [id, name] of [[orgId, "Bell reminders"], [otherOrg, "Bell reminders other"]]) await connection`insert into organizations(id,name,slug) values (${id},${name},${id.replaceAll("_", "-")})`
  for (const id of [requester, assignee, former, guest]) await connection`insert into profiles(id,full_name,email) values (${id},${id},${id + "@example.test"})`
  for (const f of fixtures) {
    await connection`insert into requests(org_id,title,description,created_by,assigned_to,status,done_at,release_state,outcome_closure)
      values (${f.org ?? orgId},${f.title},'Fixture',${f.createdBy ?? requester},${f.assignedTo ?? null},${f.status},${f.doneAt ?? null},
        ${f.releaseState ? connection.json(f.releaseState as never) : null},${f.outcomeClosure ? connection.json(f.outcomeClosure as never) : null})`
  }
})
afterEach(async () => {
  vi.useRealTimers()
  await connection`delete from notifications where org_id in (${orgId}, ${otherOrg})`
})
// The test database is rebuilt every run, and release history cannot be deleted, so fixtures stay.
afterAll(() => connection.end())
const at = (date: Date) => { vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(date) }

it("the Requester's bell writes each due result reminder once, however often it loads that day, and counts them", async () => {
  at(today)
  as(requester)
  expect(await count()).toBe(2)
  vi.setSystemTime(new Date("2026-10-28T23:59:00Z"))
  expect(await count()).toBe(2)
  expect(await reminders()).toEqual(["result_due: Measuring, due today", "result_overdue: Measuring, handed over, overdue"])
  expect(await written()).toEqual([`${requester} result_due: Measuring, due today`, `${requester} result_overdue: Measuring, handed over, overdue`])
})

it("two bell loads at once write each reminder once", async () => {
  at(today)
  as(assignee)
  expect(await Promise.all([count(), count(), count()])).toEqual([2, 2, 2])
  expect(await written()).toEqual([`${assignee} release_reminder: Done five days ago`, `${assignee} release_reminder: Done, release voided`])
})

it("a weekly reminder is written once for its week, then again a week later", async () => {
  at(today)
  as(requester)
  await count()
  at(new Date("2026-10-29T08:00:00Z"))
  await count()
  // Overdue since 21 Oct: weekly on the 21st and 28th, next on 4 Nov.
  const handedOverReminders = async () => (await written()).filter(r => r.includes("handed over"))
  expect(await handedOverReminders()).toHaveLength(1)
  at(new Date("2026-11-04T08:00:00Z"))
  // Due today, due 28 Oct, became overdue on the 29th; the handed-over one is owed again.
  expect(await count()).toBe(4)
  expect(await handedOverReminders()).toHaveLength(2)
})

it("nothing for closed Requests, a former Requester, a guest, or another workspace; a voided release is owed again", async () => {
  at(today)
  as(former)
  expect(await count()).toBe(0)
  as(guest, "org:guest")
  expect(await count()).toBe(0)
  as(assignee)
  await count()
  as(requester)
  await count()
  expect(await written()).toEqual([
    `${assignee} release_reminder: Done five days ago`,
    // Voided on 2 Oct: the release reminder started again on 5 Oct and is weekly, so 26 Oct's is owed.
    `${assignee} release_reminder: Done, release voided`,
    `${requester} result_due: Measuring, due today`,
    `${requester} result_overdue: Measuring, handed over, overdue`,
  ])
})
