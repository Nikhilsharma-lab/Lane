/**
 * #396 (spec #383 "Settings", Members; story 64): who may read Settings → Members, and what the server gives each of
 * them, on a local lane_test database. People read it as their own browser's session; only outbound HTTP is faked.
 */
import { randomUUID } from "node:crypto";
import { createElement } from "react";
import { prerender } from "react-dom/static";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { loadMembers } from "@/lib/data/members";
import { getWorkspace } from "@/lib/ensure-workspace";
import { AppProviders } from "@/test/app-providers";
import { AuthBrowser, authRouteTestFile, doorData, doorInvite, fakeOutbound, switchOnAuthRoute, type Outbound } from "@/test/auth-route-browser";
import { withoutHidden } from "@/test/exposed-markup";

vi.mock("next/navigation", async (original) => ({
  ...(await original<typeof import("next/navigation")>()),
  usePathname: () => "/settings/members",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));
// The loader only puts off the section's code; the test reads the section itself.
vi.mock("@/components/settings/workspace-members-loader", async () => ({ WorkspaceMembersLoader: (await import("@/components/settings/workspace-members")).WorkspaceMembers }));
const reads = vi.hoisted(() => ({ fail: false }));
vi.mock("@/lib/data/members", async (original) => {
  const actual = await original<typeof import("@/lib/data/members")>();
  return { ...actual, loadMembers: (...args: Parameters<typeof actual.loadMembers>) => (reads.fail ? Promise.reject(new Error("the database is away")) : actual.loadMembers(...args)) };
});

const { connection, domain, signedIn, createWorkspace, join } = authRouteTestFile("members-page.test");

let outbound: Outbound;
beforeEach(() => {
  switchOnAuthRoute();
  outbound = fakeOutbound();
  reads.fail = false;
});

/** A workspace with an Admin signed in, an invitation waiting, and the same of another workspace. */
async function twoWorkspaces() {
  const make = async (label: string) => {
    const admin = await signedIn(outbound, label);
    const orgId = await createWorkspace(admin.browser);
    await connection`update organizations set name = ${`${label}'s workspace`} where id = ${orgId}`;
    const waiting = `waiting-${randomUUID()}@${domain}`;
    doorData(await doorInvite(admin.browser, { email: waiting, role: "guest", organizationId: orgId }));
    return { ...admin, orgId, waiting };
  };
  return { here: await make("here"), elsewhere: await make("elsewhere") };
}

/** The Members section, as any Settings page renders it for this browser's person. */
async function section(browser: AuthBrowser): Promise<string | null> {
  const { membersPanel } = await import("./members-panel");
  const panel = await browser.action(async () => {
    const workspace = await getWorkspace();
    if (!workspace) throw new Error("No workspace.");
    return membersPanel(workspace);
  });
  if (!panel) return null;
  const { prelude } = await prerender(createElement(AppProviders, null, panel));
  return await new Response(prelude).text();
}
/** Where opening /settings/members sends this browser's person. */
async function redirected(browser: AuthBrowser) {
  const { default: MembersPage } = await import("./page");
  return browser.action(async () => MembersPage().then(() => null, (error: { digest?: string }) => error.digest?.split(";")[2] ?? Promise.reject(error)));
}
const removeButtons = (html: string) => [...html.matchAll(/aria-label="(Remove [^"]*)"/g)].map(([, name]) => name);

describe("Settings → Members", () => {
  it("gives an Admin this workspace's people and pending invitations, with Remove, and nothing of another's", async () => {
    const { here, elsewhere } = await twoWorkspaces();
    const teammate = await join(outbound, here.browser, "viewer", "teammate");
    const html = (await section(here.browser))!;
    for (const shown of [here.person.email, teammate.person.email, here.waiting, "Wren teammate", "Invited as a Guest"]) expect(html).toContain(shown);
    for (const other of [elsewhere.person.email, elsewhere.waiting]) expect(html).not.toContain(other);
    expect(removeButtons(html)).toEqual(["Remove Wren teammate"]);
    expect(html).toMatch(/aria-label="Role for Wren teammate: Viewer"/);
    expect(html).not.toContain("<img");
  });

  it("gives a Member the people, and no invitation, role picker or Remove", async () => {
    const { here } = await twoWorkspaces();
    const teammate = await join(outbound, here.browser, "member", "teammate");
    const html = (await section(teammate.browser))!;
    expect(html).toContain(here.person.email);
    expect(html).not.toContain(here.waiting);
    expect(html).not.toContain("Role for");
    expect(removeButtons(html)).toEqual([]);
  });

  it.each([["guest", "/"], ["viewer", "/settings/profile?section=members"]])("gives a %s no Members section, and sends them from the page to %s", async (role, to) => {
    const { here } = await twoWorkspaces();
    const { browser } = await join(outbound, here.browser, role);
    expect(await section(browser)).toBeNull();
    expect(await redirected(browser)).toBe(to);
  });

  it("says when the people couldn't be read, with Try again", async () => {
    const { here } = await twoWorkspaces();
    reads.fail = true;
    vi.spyOn(console, "error").mockImplementation(() => {});
    const html = withoutHidden((await section(here.browser))!);
    expect(html).toContain("People couldn’t be loaded");
    expect(html).toContain("Try again");
  });
});

describe("the members read", () => {
  it("lists only pending, unexpired invitations of this workspace, and only for an Admin", async () => {
    const { here } = await twoWorkspaces();
    const invite = (status: string, expires: string) => connection`
      insert into invitation (id, organization_id, email, role, status, expires_at, inviter_id)
      values (${randomUUID()}, ${here.orgId}, ${`${status}-${randomUUID()}@${domain}`}, 'member', ${status}, now() + ${expires}::interval, ${here.userId})`;
    await invite("canceled", "1 day");
    await invite("rejected", "1 day");
    await invite("accepted", "1 day");
    await invite("pending", "-1 second");
    expect((await loadMembers(here, "admin")).invitations).toEqual([{ id: expect.any(String), email: here.waiting, role: "guest" }]);
    for (const role of ["member", "guest", "viewer"] as const) expect((await loadMembers(here, role)).invitations).toEqual([]);
  });

  it("names people by name, else email, newest first, with Lane's roles only", async () => {
    const { here } = await twoWorkspaces();
    const add = async (name: string, role: string) => {
      const id = `user_${randomUUID()}`;
      await connection`insert into profiles (id, full_name, email) values (${id}, ${name}, ${`${id}@${domain}`})`;
      await connection`insert into member (id, organization_id, user_id, role, created_at) values (${randomUUID()}, ${here.orgId}, ${id}, ${role}, now())`;
      return id;
    };
    const unknown = await add("Olive Owner", "owner");
    const nameless = await add("", "viewer");
    expect((await loadMembers(here, "member")).people).toEqual([
      { userId: nameless, name: `${nameless}@${domain}`, email: `${nameless}@${domain}`, role: "viewer" },
      { userId: unknown, name: "Olive Owner", email: `${unknown}@${domain}`, role: null },
      { userId: here.userId, name: here.person.name, email: here.person.email, role: "admin" },
    ]);
  });
});
