import { requireTestDatabase } from "@/test/test-database";
import { randomUUID } from "node:crypto"
import postgres from "postgres"
import { and, eq } from "drizzle-orm"
import { afterAll, beforeAll, expect, it } from "vitest"
import { db, requests } from "@/db"
import { JOURNEY_STATUSES, dueSignal, journeyStatus, requesterOf } from "./request-journey"
import { closedWithoutResultCondition, dueSoonOrOverdueCondition, journeyStatusColumn, journeyStatusCondition, requesterColumn } from "./request-journey-sql"
import type { ReleaseFact } from "./request-release"

const connection = postgres(requireTestDatabase(process.env.DATABASE_URL).url, { max: 1, prepare: false })
const orgId = "org_journey_sql"
const person = "journey_requester"
const fingerprint = "a".repeat(64)
const fact = (dueDate: string): ReleaseFact => ({ exposureDate: "2026-10-01", audience: "All shoppers", evidence: "Rollout log", dueDate, startDate: "2026-10-01", windowKind: "relative" })
const event = (kind: string, previousRelease: ReleaseFact | null, release: ReleaseFact | null, ownerId = person) => ({ operationId: randomUUID(), fingerprint, actorId: person, at: "2026-10-02T00:00:00Z", input: { kind }, previousRelease, release, previousOwnerId: person, ownerId, revision: 1 })
const state = (release: ReleaseFact | null, history: unknown[]) => ({ version: 1, ownerId: (history.at(-1) as { ownerId: string }).ownerId, release, history })
const released = (dueDate: string) => state(fact(dueDate), [event("release", null, fact(dueDate))])
const voided = state(null, [event("release", null, fact("2026-10-20")), event("void", fact("2026-10-20"), null)])
const handedOverBeforeRelease = state(null, [event("transfer", null, null, "journey_next")])
const noResult = (release: ReleaseFact | null) => ({ version: 1, kind: "exception", reasonCode: "rolled_back", reason: "Rolled back", actorId: person, ownerId: person, closedAt: "2026-10-03T00:00:00Z", operationId: randomUUID(), fingerprint, release, revision: 1 })
const measured = (release: ReleaseFact) => ({ version: 1, kind: "measured", actorId: person, ownerId: person, closedAt: "2026-10-30T00:00:00Z", operationId: randomUUID(), fingerprint, expected: { kind: "metric" }, release, primary: { kind: "pass_fail", passed: true }, guardrails: [], evidence: "Dashboard", observedFrom: "2026-10-01", observedTo: "2026-10-28", revision: 1 })

const today = new Date("2026-10-28T12:00:00Z")
// Every saved shape the database allows, with due dates either side of "Due soon or overdue" (3 days).
const fixtures: { title: string; status: string; releaseState?: unknown; exceptionClosure?: unknown; outcomeClosure?: unknown }[] = [
  { title: "Open", status: "open" },
  { title: "In progress", status: "in_progress" },
  { title: "In progress, handed over", status: "in_progress", releaseState: handedOverBeforeRelease },
  { title: "In progress, closed without a result", status: "in_progress", exceptionClosure: noResult(null) },
  { title: "Done", status: "done" },
  { title: "Done, release voided", status: "done", releaseState: voided },
  { title: "Measuring, due in 13 days", status: "done", releaseState: released("2026-11-10") },
  { title: "Measuring, due in 4 days", status: "done", releaseState: released("2026-11-01") },
  { title: "Measuring, due in 3 days", status: "done", releaseState: released("2026-10-31") },
  { title: "Measuring, due today", status: "done", releaseState: released("2026-10-28") },
  { title: "Measuring, overdue 8 days", status: "done", releaseState: released("2026-10-20") },
  { title: "Closed, overdue release", status: "done", releaseState: released("2026-10-20"), outcomeClosure: measured(fact("2026-10-20")) },
  { title: "Closed without a result after release", status: "done", releaseState: released("2026-10-20"), exceptionClosure: noResult(fact("2026-10-20")) },
  { title: "Closed without a result at Done", status: "done", exceptionClosure: noResult(null) },
]

beforeAll(async () => {
  await connection`insert into organizations(id,name,slug) values (${orgId},'Journey SQL','journey-sql')`
  for (const id of [person, "journey_next"]) await connection`insert into profiles(id,full_name,email) values (${id},${id},${id + "@example.test"})`
  for (const f of fixtures) {
    await connection`insert into requests(org_id,title,description,created_by,status,release_state,exception_closure,outcome_closure)
      values (${orgId},${f.title},'Fixture',${person},${f.status},${f.releaseState ? connection.json(f.releaseState as never) : null},${f.exceptionClosure ? connection.json(f.exceptionClosure as never) : null},${f.outcomeClosure ? connection.json(f.outcomeClosure as never) : null})`
  }
})
afterAll(() => connection.end())

const titles = (rows: { title: string }[]) => rows.map(r => r.title).sort()
const inOrg = eq(requests.orgId, orgId)

it.each(JOURNEY_STATUSES.map(s => [s.status]))("the %s condition selects exactly the Requests the mapping puts there", async status => {
  const all = await db.select().from(requests).where(inOrg)
  const expected = all.filter(r => journeyStatus(r).status === status)
  expect(expected.length).toBeGreaterThan(0)
  expect(titles(await db.select({ title: requests.title }).from(requests).where(and(inOrg, journeyStatusCondition(status))))).toEqual(titles(expected))
})

it("the journey status column reads each Request's status as the mapping does (search facets, #133)", async () => {
  const rows = await db.select({ title: requests.title, column: journeyStatusColumn, status: requests.status, releaseState: requests.releaseState, outcomeClosure: requests.outcomeClosure, exceptionClosure: requests.exceptionClosure }).from(requests).where(inOrg)
  expect(rows.length).toBe(fixtures.length)
  for (const row of rows) expect([row.title, row.column]).toEqual([row.title, journeyStatus(row).status])
})

it("the Due soon or overdue condition selects exactly the Requests with a due tag", async () => {
  const all = await db.select().from(requests).where(inOrg)
  const expected = all.filter(r => dueSignal(r, today).kind !== "none")
  expect(titles(expected)).toEqual(["Measuring, due in 3 days", "Measuring, due today", "Measuring, overdue 8 days"])
  expect(titles(await db.select({ title: requests.title }).from(requests).where(and(inOrg, dueSoonOrOverdueCondition(today))))).toEqual(titles(expected))
})

it("the Requester column names each Request's Requester as requesterOf does (bell reminders)", async () => {
  const rows = await db.select({ title: requests.title, column: requesterColumn, createdBy: requests.createdBy, takenOnBy: requests.takenOnBy, releaseState: requests.releaseState }).from(requests).where(inOrg)
  expect(rows.find(row => row.title === "In progress, handed over")!.column).toBe("journey_next")
  for (const row of rows) expect([row.title, row.column]).toEqual([row.title, requesterOf(row)])
})

it("the closed-without-a-result condition selects exactly the Requests the mapping reads that way (search)", async () => {
  const all = await db.select().from(requests).where(inOrg)
  const expected = all.filter(r => journeyStatus(r).withoutResult)
  expect(expected.length).toBeGreaterThan(0)
  expect(titles(await db.select({ title: requests.title }).from(requests).where(and(inOrg, closedWithoutResultCondition)))).toEqual(titles(expected))
})
