import postgres from "postgres"
import { afterAll, beforeAll, expect, it } from "vitest"

let connection: ReturnType<typeof postgres>
const org = "org_review_schema", person = "user_review_schema"
beforeAll(async () => {
  const url = new URL(process.env.DATABASE_URL!)
  if (!["localhost", "127.0.0.1"].includes(url.hostname) || url.pathname !== "/lane_test") throw new Error("Require exact local lane_test")
  connection = postgres(url.href, { max: 1, prepare: false })
  await connection`insert into organizations(id,name,slug) values(${org},'Review schema','review-schema')`
  await connection`insert into profiles(id,full_name,email) values(${person},'Review schema','review-schema@example.test')`
})
afterAll(async () => {
  if (!connection) return
  await connection`delete from organizations where id=${org}`
  await connection`delete from profiles where id=${person}`
  await connection.end()
})
it("starts existing-style Requests with empty review history and version zero", async () => {
  const [row] = await connection`insert into requests(org_id,title,description,created_by) values(${org},'Review','Context',${person}) returning design_reviews,design_review_version,status`
  expect(row).toEqual({ design_reviews: [], design_review_version: 0, status: "open" })
})
it.each([{ value: {}, code: "23514" }, { value: "invalid", code: "23514" }, { value: null, code: "23502" }])("rejects a malformed review document %#", async ({ value, code }) => {
  await expect(connection`insert into requests(org_id,title,description,created_by,design_reviews) values(${org},'Review','Context',${person},${connection.json(value)}::jsonb)`).rejects.toMatchObject({ code })
})
it("rejects negative concurrency versions", async () => {
  await expect(connection`insert into requests(org_id,title,description,created_by,design_review_version) values(${org},'Review','Context',${person},-1)`).rejects.toMatchObject({ code: "23514" })
})
