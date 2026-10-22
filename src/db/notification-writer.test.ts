import postgres from "postgres";
import { TEST_DATABASE_PATH } from "@/test/test-database";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/** public.notify (migration 0032): the one writer of in-app notifications. */
const ORG = "org_notify_writer";
let sql: ReturnType<typeof postgres>;
let requestId: string;
beforeAll(async () => {
  const url = new URL(process.env.DATABASE_URL!);
  if (!TEST_DATABASE_PATH.test(url.pathname) || !["localhost", "127.0.0.1"].includes(url.hostname)) throw Error("Local test DB only");
  sql = postgres(url.toString(), { max: 1 });
  await sql`insert into organizations(id,name,slug) values (${ORG},'Notify','notify-writer')`;
  await sql`insert into profiles(id,full_name,email) values ('notify_actor','Actor','actor@notify.test'),('notify_reader','Reader','reader@notify.test')`;
  [{ id: requestId }] = await sql`insert into requests(org_id,title,description,created_by) values (${ORG},'Notify','Writer fixture','notify_actor') returning id`;
});
afterAll(async () => {
  await sql`delete from organizations where id=${ORG}`;
  await sql`delete from profiles where id in ('notify_actor','notify_reader')`;
  await sql.end();
});

describe("public.notify", () => {
  it("tells each recipient once, never the actor, a missing person or someone without a profile", async () => {
    const [{ sent }] = await sql`select public.notify(array['notify_reader','notify_reader','notify_actor',null,'no_profile'], ${ORG}, 'comment_added', ${requestId}, 'notify_actor', '') as sent`;
    expect(sent).toBe(1);
    expect(await sql`select user_id, type::text, actor_id, detail from notifications where request_id=${requestId}`).toEqual([
      { user_id: "notify_reader", type: "comment_added", actor_id: "notify_actor", detail: null },
    ]);
  });
  it("writes nothing when the actor has no profile, instead of failing the change", async () => {
    const [{ sent }] = await sql`select public.notify(array['notify_reader'], ${ORG}, 'comment_added', ${requestId}, 'gone_actor') as sent`;
    expect(sent).toBe(0);
  });
});
