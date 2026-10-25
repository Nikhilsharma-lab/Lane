/**
 * #204 / #205: the Inbox page as the server renders it, with notifications and Requests read from the real test database. The
 * session's workspace and role are faked; everything below the page (loader, read model, view) is real.
 */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { ToastStackProvider } from "@/components/arc/toast-stack/toast-stack";
import { AppProviders } from "@/test/app-providers";
import { TEST_DATABASE_PATH } from "@/test/test-database";

const ORG = "org_inbox_page";
const MEMBER = "user_inbox_page_member", GUEST = "user_inbox_page_guest", ACTOR = "user_inbox_page_actor";
const session = vi.hoisted(() => ({ userId: "", role: "member" as "admin" | "member" | "guest" }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/ensure-workspace", () => ({
  getMember: async () => ({ userId: session.userId, orgId: ORG, role: session.role }),
  getWorkspace: async () => ({ needsOnboarding: false, userId: session.userId, orgId: ORG, role: session.role, profileRole: "pm", fullName: "Pat", email: "pat@example.test", workspaceName: "Inbox page" }),
}));
vi.mock("next/navigation", () => ({
  redirect: (to: string) => { throw new Error(`redirect:${to}`); },
  usePathname: () => "/inbox",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

const open = async (userId: string, role: typeof session.role) => {
  Object.assign(session, { userId, role });
  const { default: InboxPage } = await import("./page");
  return renderToStaticMarkup(createElement(ToastStackProvider, null, createElement(AppProviders, { orgId: ORG }, await InboxPage())));
};
const items = (html: string) => [...html.matchAll(/data-inbox-item="[^"]+"[^>]*>[\s\S]*?aria-label="([^"]+)"/g)].map(match => match[1]);

let connection: ReturnType<typeof postgres>;
beforeAll(async () => {
  const url = new URL(process.env.DATABASE_URL!);
  if (!["localhost", "127.0.0.1"].includes(url.hostname) || !TEST_DATABASE_PATH.test(url.pathname)) throw new Error("Inbox page tests require disposable local PostgreSQL");
  connection = postgres(url.toString(), { max: 1, prepare: false });
  await connection`insert into organizations (id,name,slug) values (${ORG},'Inbox page','inbox-page')`;
  for (const [id, name] of [[MEMBER, "Morgan"], [GUEST, "Gale"], [ACTOR, "Priya Shah"]]) await connection`insert into profiles (id,full_name,email) values (${id},${name},${id + "@example.test"})`;
  const [mine] = await connection`insert into requests (org_id,title,description,created_by,reframed_problem) values (${ORG},'Checkout copy','Fixture',${MEMBER},'Customers cannot find the delivery date') returning id, request_number`;
  const [guests] = await connection`insert into requests (org_id,title,description,created_by,reframed_problem) values (${ORG},'Guest form','Fixture',${GUEST},'Visitors give up on the contact form') returning id, request_number`;
  await connection`insert into notifications (user_id,org_id,type,request_id,actor_id,read_at,created_at) values
    (${MEMBER},${ORG},'comment_added',${mine.id},${ACTOR},null,'2026-10-25T09:00:00Z'),
    (${MEMBER},${ORG},'request_done',${mine.id},${ACTOR},'2026-10-25T09:30:00Z','2026-10-25T09:10:00Z'),
    (${MEMBER},${ORG},'review_requested',${mine.id},${ACTOR},null,'2026-10-25T09:20:00Z'),
    (${MEMBER},${ORG},'invite_accepted',null,${ACTOR},null,'2026-10-25T09:40:00Z'),
    (${GUEST},${ORG},'request_picked_up',${guests.id},${ACTOR},null,'2026-10-25T09:00:00Z'),
    (${GUEST},${ORG},'comment_added',${mine.id},${ACTOR},null,'2026-10-25T09:05:00Z'),
    (${GUEST},${ORG},'invite_accepted',null,${ACTOR},null,'2026-10-25T09:06:00Z')`;
  // Done long ago and never released: one Record the release for its Requester.
  const [done] = await connection`insert into requests (org_id,title,description,created_by,reframed_problem,status,done_at) values (${ORG},'Checkout total','Fixture',${MEMBER},'Checkout total is unclear','done','2026-01-05T09:00:00Z') returning request_number`;
  codes.done = `LAN-${done.request_number}`;
  codes.mine = `LAN-${mine.request_number}`;
  codes.guests = `LAN-${guests.request_number}`;
});
const codes = { mine: "", guests: "", done: "" };
afterAll(async () => {
  await connection`delete from organizations where id = ${ORG}`;
  await connection`delete from profiles where id in (${MEMBER}, ${GUEST}, ${ACTOR})`;
  await connection.end();
});

describe("the Inbox page", () => {
  it("lists a Member's unread For-your-information items, newest first, under the Inbox heading", async () => {
    const html = await open(MEMBER, "member");
    expect(html).toMatch(/<h1[^>]*>Inbox<\/h1>/);
    expect(html).toContain(">For your information</h2>");
    expect(items(html)).toEqual([
      `${codes.done} · Checkout total is unclear, Still Done. Record the release once it is live`,
      "Priya Shah accepted your invite, unread",
      `${codes.mine} · Customers cannot find the delivery date, Priya Shah commented, unread`,
    ]);
    expect(html).toContain(">Mark all read<");
  });

  it("shows a Guest only the items about their own submissions, and no Needs you", async () => {
    const html = await open(GUEST, "guest");
    expect(items(html)).toEqual([`${codes.guests} · Visitors give up on the contact form, Priya Shah picked it up, unread`]);
    expect(html).not.toContain(">Needs you</h2>");
  });

  it("lists what needs a Member above their updates, worked out from their Requests", async () => {
    const html = await open(MEMBER, "member");
    expect(html).toMatch(/<h2[^>]*id="inbox-needs-you"[^>]*>Needs you<\/h2>/);
    expect(html).toContain(`aria-label="${codes.done} · Checkout total is unclear, Still Done. Record the release once it is live"`);
    expect(html).toContain('aria-label="1 needs you"');
  });

  it("says all caught up once everything is read and nothing needs the Member", async () => {
    await connection`update notifications set read_at = now() where org_id = ${ORG} and user_id = ${MEMBER}`;
    const reading = await open(MEMBER, "member");
    expect(items(reading)).toEqual([`${codes.done} · Checkout total is unclear, Still Done. Record the release once it is live`]);
    expect(reading).toContain("Nothing new to read.");
    expect(reading).not.toContain(">Mark all read<");
    // Undo Done: the work is no longer Done, so Record the release clears itself.
    await connection`update requests set status = 'in_progress' where org_id = ${ORG} and title = 'Checkout total'`;
    const html = await open(MEMBER, "member");
    expect(items(html)).toEqual([]);
    expect(html).toContain("Nothing needs you right now.");
    expect(html).toContain("You’re all caught up");
  });
});
