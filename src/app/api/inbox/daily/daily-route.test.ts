/**
 * #206: GET /api/inbox/daily, the one scheduled daily job. It refuses every call while CRON_SECRET is unset and
 * any call without that secret; with it, it runs the daily delivery once. Email stays switched off here, so the
 * recording stand-in sends nothing and the log records "would send". Real database and
 * member rows, no session.
 */
import postgres from "postgres"
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest"
import { addMembers } from "@/test/member-fixtures"
import { requireTestDatabase } from "@/test/test-database"

const ORG = "org_inbox_daily_route"
const OTHER_ORG = "org_inbox_daily_route_other"
const REQUESTER = "daily_route_requester"
/** One person per role, each the Requester of a Request done a while ago. */
const ROLES = { daily_route_admin: "admin", daily_route_member: "member", daily_route_guest: "guest", daily_route_viewer: "viewer", daily_route_unknown: "owner" }
vi.mock("next/server", async (original) => ({ ...(await original<typeof import("next/server")>()), after: vi.fn() }))
vi.mock("@/lib/session", () => ({ readSession: vi.fn(async () => null) }))

const url = new URL(process.env.DATABASE_URL!)
requireTestDatabase(process.env.DATABASE_URL);
const connection = postgres(url.toString(), { max: 1, prepare: false, onnotice: () => {} })
let requestId: string

beforeAll(async () => {
  await connection`insert into organizations(id,name,slug) values (${ORG},'Daily','inbox-daily-route'), (${OTHER_ORG},'Daily elsewhere','inbox-daily-route-other')`
  await connection`insert into profiles(id,full_name,email) values (${REQUESTER},'Requester',${REQUESTER + "@example.test"})`
  await addMembers(ORG, { [REQUESTER]: "admin", ...ROLES })
  // A member only of another workspace is nobody here.
  await addMembers(OTHER_ORG, { daily_route_elsewhere: "admin" })
  for (const userId of [...Object.keys(ROLES), "daily_route_elsewhere"])
    await connection`insert into requests(org_id,title,description,created_by,status,done_at) values (${ORG},'Theirs, done a while ago','Fixture',${userId},'done',now() - interval '5 days')`
  ;[{ id: requestId }] = await connection`insert into requests(org_id,title,description,created_by,status,done_at) values (${ORG},'Done a while ago','Fixture',${REQUESTER},'done',now() - interval '5 days') returning id`
})
afterEach(() => vi.unstubAllEnvs())
afterAll(async () => {
  await connection`delete from organizations where id in (${ORG}, ${OTHER_ORG})`
  await connection`delete from profiles where starts_with(id, 'daily_route_')`
  await connection.end()
})

const call = async (authorization?: string) => {
  const { GET } = await import("./route")
  return GET(new Request("http://lane.test/api/inbox/daily", { headers: authorization ? { authorization } : {} }))
}
const logged = () => connection`select outcome from delivery_log where org_id = ${ORG} and request_id = ${requestId}`

describe("the daily Inbox job", () => {
  it("refuses every call while no secret is set", async () => {
    vi.stubEnv("CRON_SECRET", "")
    const response = await call("Bearer anything")
    expect(response.status).toBe(503)
    expect(await logged()).toEqual([])
  })

  it("refuses a call without the secret", async () => {
    vi.stubEnv("CRON_SECRET", "daily-secret")
    expect((await call()).status).toBe(401)
    expect((await call("Bearer wrong-secret")).status).toBe(401)
    expect(await logged()).toEqual([])
  })

  it("runs delivery with the secret, once per item however often it is called, and reports totals only", async () => {
    vi.stubEnv("CRON_SECRET", "daily-secret")
    vi.stubEnv("LANE_EMAIL_DELIVERY", "")
    const first = await call("Bearer daily-secret")
    expect(first.status).toBe(200)
    expect(first.headers.get("cache-control")).toContain("no-store")
    const body = await first.json()
    expect(Object.keys(body).sort()).toEqual(["failed", "sent", "skipped"])
    expect(body.sent).toBeGreaterThanOrEqual(1)
    expect(await logged()).toEqual([{ outcome: "would_send" }])
    await call("Bearer daily-secret")
    expect(await logged()).toEqual([{ outcome: "would_send" }])
  })

  it("delivers to this workspace's Admins and Members only, never a Guest, a Viewer, an unknown role or someone who isn't a member", async () => {
    const delivered = await connection`select user_id from delivery_log where org_id = ${ORG} order by user_id`
    expect(delivered.map((row) => row.user_id)).toEqual(["daily_route_admin", "daily_route_member", REQUESTER])
  })
})
