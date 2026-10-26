import postgres from "postgres";
import { TEST_DATABASE_PATH } from "@/test/test-database";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/** Migration 0034: the times a Request was picked up and marked Done (its stored reminders were retired by 0040). */
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

// The stored reminders 0034 added were retired by 0040 (#205); retired-reminders-schema.test.ts covers that.
describe("notifications", () => {
  it("lets an event notify a person twice in a day", async () => {
    const twice = sql`insert into notifications(user_id,org_id,type,request_id,actor_id) values ('reminder_requester',${ORG},'comment_added',${requestId},'reminder_requester'),('reminder_requester',${ORG},'comment_added',${requestId},'reminder_requester')`;
    await expect(twice).resolves.toBeDefined();
  });
});

describe("requests.done_at", () => {
  it("takes the Done time of work marked Done before 0034 from updated_at, without restamping it", async () => {
    expect(await sql`select title, done_at, updated_at from requests where org_id='org_done_time' order by title`).toEqual([
      { title: "Done before 0034", done_at: new Date("2026-10-01T09:30:00Z"), updated_at: new Date("2026-10-01T09:30:00Z") },
      { title: "Open before 0034", done_at: null, updated_at: new Date("2026-10-01T09:30:00Z") },
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

describe("requests.picked_up_at", () => {
  it("is stamped when work is picked up, kept through Done and Undo Done, and cleared if it goes back to Open", async () => {
    const [{ id }] = await sql`insert into requests(org_id,title,description,created_by) values (${ORG},'Pickup time','Stamp','reminder_requester') returning id`;
    const pickedUpAt = async () => (await sql`select picked_up_at from requests where id=${id}`)[0].picked_up_at;
    expect(await pickedUpAt()).toBeNull();
    await sql`update requests set status='in_progress' where id=${id}`;
    const stamped = await pickedUpAt();
    expect(stamped).toBeInstanceOf(Date);
    await sql`update requests set status='done' where id=${id}`;
    expect(await pickedUpAt()).toEqual(stamped);
    await sql`update requests set status='in_progress' where id=${id}`;
    expect(await pickedUpAt()).toEqual(stamped);
    await sql`update requests set status='open' where id=${id}`;
    expect(await pickedUpAt()).toBeNull();
  });
  it("is stamped for a Request written as In progress, and left unknown for work picked up before 0034", async () => {
    const [{ picked_up_at }] = await sql`insert into requests(org_id,title,description,created_by,status) values (${ORG},'Written in progress','Stamp','reminder_requester','in_progress') returning picked_up_at`;
    expect(picked_up_at).toBeInstanceOf(Date);
    expect((await sql`select picked_up_at from requests where org_id='org_done_time'`).map(r => r.picked_up_at)).toEqual([null, null]);
  });
  it("is never set on Open work", async () => {
    const [{ picked_up_at }] = await sql`insert into requests(org_id,title,description,created_by,picked_up_at) values (${ORG},'Open','Not picked up','reminder_requester',now()) returning picked_up_at`;
    expect(picked_up_at).toBeNull();
  });
});
