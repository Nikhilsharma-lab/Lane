import postgres from "postgres";
import { TEST_DATABASE_PATH } from "@/test/test-database";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * Migration 0041 (#206): how Needs-you items reach people outside Lane. A delivery preference per person per
 * workspace (no row means Email), and a delivery log that holds each person's item at most once.
 */
const ORG = "org_inbox_delivery_schema";
const OTHER = "org_inbox_delivery_schema_other";
const PERSON = "inbox_delivery_schema_person";
let sql: ReturnType<typeof postgres>;
let requestId: string;
let otherRequestId: string;

beforeAll(async () => {
  const url = new URL(process.env.DATABASE_URL!);
  if (!TEST_DATABASE_PATH.test(url.pathname) || !["localhost", "127.0.0.1"].includes(url.hostname)) throw Error("Local test DB only");
  sql = postgres(url.toString(), { max: 1, onnotice: () => {} });
  await sql`insert into organizations(id,name,slug) values (${ORG},'Delivery','inbox-delivery-schema'), (${OTHER},'Other','inbox-delivery-schema-other')`;
  await sql`insert into profiles(id,full_name,email) values (${PERSON},'Person','person@inbox-delivery.test')`;
  [{ id: requestId }] = await sql`insert into requests(org_id,title,description,created_by) values (${ORG},'Deliver','Fixture',${PERSON}) returning id`;
  [{ id: otherRequestId }] = await sql`insert into requests(org_id,title,description,created_by) values (${OTHER},'Elsewhere','Fixture',${PERSON}) returning id`;
});
afterAll(async () => {
  await sql`delete from organizations where id in (${ORG}, ${OTHER})`;
  await sql`delete from profiles where id = ${PERSON}`;
  await sql.end();
});

const log = (over: { org?: string; request?: string; key?: string; channel?: string; outcome?: string } = {}) => sql`
  insert into delivery_log(org_id,user_id,request_id,item_key,channel,outcome)
  values (${over.org ?? ORG},${PERSON},${over.request ?? requestId},${over.key ?? `review:${requestId}:r1:2026-10-25T09:00:00.000Z`},${over.channel ?? "email"},${over.outcome ?? "would_send"})
  returning id`;

describe("delivery preferences", () => {
  it("keeps one choice per person per workspace: Email, Slack DM or Off", async () => {
    await sql`insert into delivery_preferences(org_id,user_id,channel) values (${ORG},${PERSON},'off')`;
    await expect(sql`insert into delivery_preferences(org_id,user_id,channel) values (${ORG},${PERSON},'email')`).rejects.toMatchObject({ code: "23505" });
    await sql`insert into delivery_preferences(org_id,user_id,channel) values (${OTHER},${PERSON},'slack')`;
    expect(await sql`select org_id, channel from delivery_preferences where user_id=${PERSON} order by org_id`).toEqual([
      { org_id: ORG, channel: "off" },
      { org_id: OTHER, channel: "slack" },
    ]);
  });

  it("refuses any other channel", async () => {
    await expect(sql`update delivery_preferences set channel='sms' where org_id=${ORG} and user_id=${PERSON}`).rejects.toMatchObject({ code: "23514" });
  });
});

describe("the delivery log", () => {
  it("holds each person's item once, however often it is offered", async () => {
    const key = `result_due:${requestId}:2026-11-01`;
    expect(await log({ key })).toHaveLength(1);
    await expect(log({ key })).rejects.toMatchObject({ code: "23505" });
    expect(await sql`insert into delivery_log(org_id,user_id,request_id,item_key,channel,outcome) values (${ORG},${PERSON},${requestId},${key},'email','sent') on conflict do nothing returning id`).toEqual([]);
  });

  it("records the channel, whether it was really sent, and when", async () => {
    const [row] = await sql`select channel, outcome, sent_at from delivery_log where org_id=${ORG} and item_key=${`result_due:${requestId}:2026-11-01`}`;
    expect(row).toMatchObject({ channel: "email", outcome: "would_send" });
    expect(row.sent_at).toBeInstanceOf(Date);
    await expect(log({ key: "concern:x", channel: "off" })).rejects.toMatchObject({ code: "23514" });
    await expect(log({ key: "concern:y", outcome: "queued" })).rejects.toMatchObject({ code: "23514" });
    await expect(log({ key: "" })).rejects.toMatchObject({ code: "23514" });
  });

  it("is never rewritten once recorded", async () => {
    await expect(sql`update delivery_log set outcome='sent' where org_id=${ORG}`).rejects.toThrow("immutable");
  });

  it("only names a Request of the same workspace", async () => {
    await expect(log({ request: otherRequestId, key: "review:elsewhere" })).rejects.toMatchObject({ code: "23503" });
  });

  it("goes with the Request and with the workspace", async () => {
    await log({ request: otherRequestId, org: OTHER, key: "record_release:gone" });
    await sql`delete from requests where id=${otherRequestId}`;
    expect(await sql`select 1 from delivery_log where org_id=${OTHER}`).toEqual([]);
    await sql`delete from organizations where id=${OTHER}`;
    expect(await sql`select 1 from delivery_preferences where org_id=${OTHER}`).toEqual([]);
  });

  it("is closed to the public database roles", async () => {
    const rows = await sql`select relname, relrowsecurity from pg_class where relname in ('delivery_log','delivery_preferences') order by relname`;
    expect(rows).toEqual([{ relname: "delivery_log", relrowsecurity: true }, { relname: "delivery_preferences", relrowsecurity: true }]);
    const grants = await sql`select table_name from information_schema.role_table_grants where table_name in ('delivery_log','delivery_preferences') and grantee in ('PUBLIC','anon','authenticated')`;
    expect(grants).toEqual([]);
  });
});
