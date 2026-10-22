import postgres from "postgres";
import { TEST_DATABASE_PATH } from "@/test/test-database";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/** Migration 0033: reminders are actor-less notifications, written at most once a UTC day. */
const ORG = "org_reminder_schema";
let sql: ReturnType<typeof postgres>;
let requestId: string;
beforeAll(async () => {
  const url = new URL(process.env.DATABASE_URL!);
  if (!TEST_DATABASE_PATH.test(url.pathname) || !["localhost", "127.0.0.1"].includes(url.hostname)) throw Error("Local test DB only");
  sql = postgres(url.toString(), { max: 1, onnotice: () => {} });
  await sql`insert into organizations(id,name,slug) values (${ORG},'Reminders','reminder-schema')`;
  await sql`insert into profiles(id,full_name,email) values ('reminder_requester','Requester','requester@reminder.test')`;
  [{ id: requestId }] = await sql`insert into requests(org_id,title,description,created_by) values (${ORG},'Remind','Reminder fixture','reminder_requester') returning id`;
});
afterAll(async () => {
  await sql`delete from organizations where id=${ORG}`;
  await sql`delete from profiles where id='reminder_requester'`;
  await sql.end();
});

const remind = (type: string, at: string, request: string | null = requestId) =>
  sql`insert into notifications(user_id,org_id,type,request_id,actor_id,created_at) values ('reminder_requester',${ORG},${type}::notification_type,${request},null,${at}::timestamptz)`;

describe("reminder notifications", () => {
  it.each(["release_reminder", "result_due_soon", "result_due", "result_overdue"])("%s is written once per Request, recipient and UTC day", async (type) => {
    await remind(type, "2026-10-25T00:10:00Z");
    // Late evening in New York is still the same UTC day.
    await expect(remind(type, "2026-10-25T23:50:00Z")).rejects.toThrow(/notifications_reminder_once_a_day/);
    await expect(remind(type, "2026-10-26T00:00:00Z")).resolves.toBeDefined();
  });
  it("keeps an actor on every other kind, and a Request on every reminder", async () => {
    await expect(remind("comment_added", "2026-10-25T12:00:00Z")).rejects.toThrow(/notifications_actor_check/);
    await expect(remind("result_due", "2026-10-27T12:00:00Z", null)).rejects.toThrow(/notifications_reminder_request_check/);
  });
  it("still lets an event that is not a reminder notify a person twice in a day", async () => {
    const twice = sql`insert into notifications(user_id,org_id,type,request_id,actor_id) values ('reminder_requester',${ORG},'comment_added',${requestId},'reminder_requester'),('reminder_requester',${ORG},'comment_added',${requestId},'reminder_requester')`;
    await expect(twice).resolves.toBeDefined();
  });
});

describe("requests.done_at", () => {
  it("takes the Done time of work marked Done before 0033 from updated_at, without restamping it", async () => {
    expect(await sql`select title, done_at, updated_at from requests where org_id='org_done_time' order by title`).toEqual([
      { title: "Done before 0033", done_at: new Date("2026-10-01T09:30:00Z"), updated_at: new Date("2026-10-01T09:30:00Z") },
      { title: "Open before 0033", done_at: null, updated_at: new Date("2026-10-01T09:30:00Z") },
    ]);
  });
  it("is stamped whenever a Request becomes Done and cleared whenever it stops being Done", async () => {
    const [{ id }] = await sql`insert into requests(org_id,title,description,created_by,status) values (${ORG},'Done time','Stamp','reminder_requester','done') returning id`;
    const doneAt = async () => (await sql`select done_at from requests where id=${id}`)[0].done_at;
    expect(await doneAt()).toBeInstanceOf(Date);
    await sql`update requests set status='in_progress' where id=${id}`;
    expect(await doneAt()).toBeNull();
    await sql`update requests set status='done' where id=${id}`;
    const stamped = await doneAt();
    expect(stamped).toBeInstanceOf(Date);
    // Editing a Done Request, or saving it as Done again, leaves its Done time alone.
    await sql`update requests set priority='urgent', status='done' where id=${id}`;
    expect(await doneAt()).toEqual(stamped);
  });
  it("is only ever set on Done work", async () => {
    await expect(sql`insert into requests(org_id,title,description,created_by,done_at) values (${ORG},'Open','Not done','reminder_requester',now())`).rejects.toThrow(/requests_done_at_check/);
  });
});
