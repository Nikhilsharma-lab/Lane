/**
 * #206: GET /api/inbox/daily, the one scheduled daily job. It refuses every call while CRON_SECRET is unset and
 * any call without that secret; with it, it runs the daily delivery once. Email stays switched off here, so the
 * recording stand-in sends nothing and the log records "would send". Real database, mocked Clerk roster.
 */
import postgres from "postgres"
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest"
import { TEST_DATABASE_PATH } from "@/test/test-database"

const ORG = "org_inbox_daily_route"
const REQUESTER = "daily_route_requester"
vi.mock("next/server", async (original) => ({ ...(await original<typeof import("next/server")>()), after: vi.fn() }))
vi.mock("@clerk/nextjs/server", () => ({
  auth: vi.fn(async () => ({ userId: null })),
  clerkClient: async () => ({
    organizations: {
      getOrganizationMembershipList: async ({ organizationId }: { organizationId: string }) => organizationId === ORG
        ? { totalCount: 1, data: [{ organization: { id: ORG }, role: "org:admin", publicUserData: { userId: REQUESTER, identifier: `${REQUESTER}@example.test` } }] }
        : { totalCount: 0, data: [] },
    },
  }),
}))

const url = new URL(process.env.DATABASE_URL!)
if (!TEST_DATABASE_PATH.test(url.pathname) || !["localhost", "127.0.0.1"].includes(url.hostname)) throw Error("Local test DB only")
const connection = postgres(url.toString(), { max: 1, prepare: false, onnotice: () => {} })
let requestId: string

beforeAll(async () => {
  await connection`insert into organizations(id,name,slug) values (${ORG},'Daily','inbox-daily-route')`
  await connection`insert into profiles(id,full_name,email) values (${REQUESTER},'Requester',${REQUESTER + "@example.test"})`
  ;[{ id: requestId }] = await connection`insert into requests(org_id,title,description,created_by,status,done_at) values (${ORG},'Done a while ago','Fixture',${REQUESTER},'done',now() - interval '5 days') returning id`
})
afterEach(() => vi.unstubAllEnvs())
afterAll(async () => {
  await connection`delete from organizations where id = ${ORG}`
  await connection`delete from profiles where id = ${REQUESTER}`
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
})
