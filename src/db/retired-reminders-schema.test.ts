import postgres from "postgres";
import { requireTestDatabase } from "@/test/test-database";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * Migration 0040 (#205): the stored bell reminders are retired. Needs-you items (Record the release, Result
 * due) are worked out from Request state, so no reminder is stored again, and every notification has an actor.
 * The fixture (src/test/retired-reminders-fixtures.sql) wrote one of each reminder kind before 0040 ran.
 */
const FIXTURE_ORG = "org_retired_reminders";
const ORG = "org_retired_reminders_schema";
const REMINDERS = ["release_reminder", "result_due_soon", "result_due", "result_overdue"];
let sql: ReturnType<typeof postgres>;
let requestId: string;

beforeAll(async () => {
  const url = new URL(process.env.DATABASE_URL!);
  requireTestDatabase(process.env.DATABASE_URL);
  sql = postgres(url.toString(), { max: 1, onnotice: () => {} });
  await sql`insert into organizations(id,name,slug) values (${ORG},'Retired reminders','retired-reminders-schema')`;
  await sql`insert into profiles(id,full_name,email) values ('retired_schema_person','Person','person@retired-schema.test')`;
  [{ id: requestId }] = await sql`insert into requests(org_id,title,description,created_by) values (${ORG},'Remind','Fixture','retired_schema_person') returning id`;
});
afterAll(async () => {
  await sql`delete from organizations where id in (${ORG}, ${FIXTURE_ORG})`;
  await sql`delete from profiles where id in ('retired_schema_person','retired_reminders_requester','retired_reminders_teammate')`;
  await sql.end();
});

const write = (type: string, actor: string | null) =>
  sql`insert into notifications(user_id,org_id,type,request_id,actor_id) values ('retired_schema_person',${ORG},${type}::notification_type,${requestId},${actor})`;

describe("retiring the reminder types", () => {
  it("removes the reminders stored before it and keeps every other notification as it was", async () => {
    const rows = await sql`select type, read_at, created_at from notifications where org_id=${FIXTURE_ORG} order by created_at`;
    expect(rows).toEqual([
      { type: "request_done", read_at: new Date("2026-10-21T09:00:00Z"), created_at: new Date("2026-10-10T15:00:00Z") },
      { type: "comment_added", read_at: null, created_at: new Date("2026-10-20T09:00:00Z") },
    ]);
  });

  it.each(REMINDERS)("refuses a new %s, with or without an actor", async (type) => {
    await expect(write(type, null)).rejects.toThrow();
    await expect(write(type, "retired_schema_person")).rejects.toThrow(/notifications_retired_reminder_check/);
  });

  it("requires an actor on every notification again", async () => {
    await expect(write("comment_added", null)).rejects.toMatchObject({ code: "23502" });
    await expect(write("comment_added", "retired_schema_person")).resolves.toBeDefined();
  });

  it("drops the once-a-day reminder key", async () => {
    expect(await sql`select indexname from pg_indexes where indexname='notifications_reminder_once_a_day'`).toEqual([]);
  });
});
