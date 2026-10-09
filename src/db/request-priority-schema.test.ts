import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const ORG = "org_request_priority_schema";
const USER = "user_request_priority_schema";
let connection: ReturnType<typeof postgres>;

beforeAll(async () => {
  const databaseUrl = process.env.DATABASE_URL!;
  const url = new URL(databaseUrl);
  if (!["localhost", "127.0.0.1"].includes(url.hostname) || url.pathname !== "/lane_test") {
    throw new Error("Request priority tests require disposable local lane_test PostgreSQL");
  }
  connection = postgres(databaseUrl, { max: 2, prepare: false });
  await connection`insert into profiles (id,full_name,email) values (${USER},'Request priority','request-priority@example.test')`;
  await connection`insert into organizations (id,name,slug) values (${ORG},'Priority schema','request-priority-schema')`;
});

afterAll(async () => {
  if (!connection) return;
  await connection`delete from organizations where id = ${ORG}`;
  await connection`delete from profiles where id = ${USER}`;
  await connection.end();
});

async function insertRequest() {
  const [row] = await connection`
    insert into requests (org_id,title,description,created_by)
    values (${ORG},'Priority probe','A saved Request',${USER})
    returning id, priority::text as priority, status::text as status
  `;
  return row as { id: string; priority: string; status: string };
}

describe("saved Request priority (migration 0019)", () => {
  it("defaults every Request to no priority", async () => {
    expect((await insertRequest()).priority).toBe("none");
  });

  it("stores each allowed value without touching status", async () => {
    const created = await insertRequest();
    for (const value of ["urgent", "high", "medium", "low", "none"]) {
      await connection`update requests set priority = ${value}::request_priority where id = ${created.id}`;
      const [saved] = await connection`select priority::text as priority, status::text as status from requests where id = ${created.id}`;
      expect(saved).toEqual({ priority: value, status: "open" });
    }
  });

  it("rejects values outside the fixed set and never accepts null", async () => {
    const created = await insertRequest();
    await expect(connection`update requests set priority = 'critical' where id = ${created.id}`).rejects.toMatchObject({ code: "22P02" });
    await expect(connection`update requests set priority = null where id = ${created.id}`).rejects.toMatchObject({ code: "23502" });
  });
});
