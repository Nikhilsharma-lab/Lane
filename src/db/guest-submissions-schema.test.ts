/**
 * #212, migration 0045: the database's own rules for Guest submissions. They wait Open until someone takes them on;
 * taking on happens once, by someone other than the Guest, and never moves; the flag is set only when filed.
 */
import postgres from "postgres";
import { afterAll, beforeAll, expect, it } from "vitest";
import { requireTestDatabase } from "@/test/test-database";

const ORG = "org_guest_submission_schema";
const [GUEST, MEMBER, OTHER] = ["gs_schema_guest", "gs_schema_member", "gs_schema_other"];
const url = new URL(process.env.DATABASE_URL!);
requireTestDatabase(process.env.DATABASE_URL);
const connection = postgres(url.toString(), { max: 1, prepare: false, onnotice: () => {} });

beforeAll(async () => {
  await connection`insert into organizations(id,name,slug) values (${ORG},'Guest submission schema','guest-submission-schema')`;
  for (const id of [GUEST, MEMBER, OTHER]) await connection`insert into profiles(id,full_name,email) values (${id},${id},${id + "@example.test"})`;
});
afterAll(async () => {
  await connection`delete from organizations where id = ${ORG}`;
  await connection`delete from profiles where id in (${GUEST}, ${MEMBER}, ${OTHER})`;
  await connection.end();
});

async function submission() {
  const [row] = await connection`insert into requests(org_id,title,description,created_by,guest_submission) values (${ORG},'Guest asks','Something a Guest needs.',${GUEST},true) returning id`;
  return row.id as string;
}

it("keeps a waiting Guest submission Open until someone takes it on", async () => {
  const id = await submission();
  await expect(connection`update requests set status='in_progress' where id=${id}`).rejects.toMatchObject({ code: "23514" });
  await connection`update requests set taken_on_by=${MEMBER}, taken_on_at=now() where id=${id}`;
  await connection`update requests set status='in_progress' where id=${id}`;
  expect((await connection`select status from requests where id=${id}`)[0].status).toBe("in_progress");
});

it("takes on once, by someone other than the Guest, with a time, and never moves it", async () => {
  const id = await submission();
  await expect(connection`update requests set taken_on_by=${GUEST}, taken_on_at=now() where id=${id}`).rejects.toMatchObject({ code: "23514" });
  await expect(connection`update requests set taken_on_by=${MEMBER} where id=${id}`).rejects.toMatchObject({ code: "23514" });
  await connection`update requests set taken_on_by=${MEMBER}, taken_on_at=now() where id=${id}`;
  await expect(connection`update requests set taken_on_by=${OTHER} where id=${id}`).rejects.toThrow("immutable");
  await expect(connection`update requests set taken_on_by=null, taken_on_at=null where id=${id}`).rejects.toThrow("immutable");
  await expect(connection`update requests set guest_submission=false where id=${id}`).rejects.toThrow("immutable");
});

it("takes on only Guest submissions, and never turns a Request into one", async () => {
  const [row] = await connection`insert into requests(org_id,title,description,created_by) values (${ORG},'Member work','Filed by a Member.',${MEMBER}) returning id, guest_submission`;
  expect(row.guest_submission).toBe(false);
  await expect(connection`update requests set taken_on_by=${OTHER}, taken_on_at=now() where id=${row.id}`).rejects.toMatchObject({ code: "23514" });
  await expect(connection`update requests set guest_submission=true where id=${row.id}`).rejects.toThrow("immutable");
});
