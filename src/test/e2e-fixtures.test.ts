/**
 * #399: the e2e fixtures on the test database, with the app's own `/api/auth` route and session seam judging what they
 * make. A `lane_test_*` database on this machine is a target the safety pin accepts, so these run the real helpers.
 */
import { randomUUID } from "node:crypto";
import type { BrowserContext, Page } from "@playwright/test";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { readSession } from "@/lib/session";
import { AUTH_ORIGIN, AuthBrowser, TEST_AUTH_ENV, authRouteTestFile, codeOf, fakeOutbound, signIn, signUp, switchOnAuthRoute } from "./auth-route-browser";
import { proveAppAcceptsTestSessions } from "../../e2e/helpers/app-auth-proof";
import { testSessionCookies } from "../../e2e/helpers/better-auth";
import { cleanupTestWorkspace, deleteTestWorkspace, provisionTestWorkspace, seedTestRequest } from "../../e2e/helpers/cleanup";
import { replaceEmailCode } from "../../e2e/helpers/email-codes";
import { assertOwnedOrganization, registerBrowserTestOrganization, registerBrowserTestUser, testEmail } from "../../e2e/helpers/fixtures";
import { createTestUser, deleteTestUser, signInTestUser, type TestUser } from "../../e2e/helpers/test-user";
import { addTestMember, createTestWorkspace, removeTestMember, setTestMemberRole, type WorkspaceRole } from "../../e2e/helpers/workspaces";

// The strangers these tests check the fixtures leave alone, and the clean-up of them.
const { connection, person, signedIn, createWorkspace } = authRouteTestFile("e2e-fixtures.lane.test");
const made: TestUser[] = [];

beforeEach(() => {
  switchOnAuthRoute();
  vi.stubEnv("LANE_E2E_ALLOW_REMOTE", "1");
  vi.stubEnv("LANE_E2E_LOCAL_DATABASE", "1");
  vi.stubEnv("E2E_BASE_URL", AUTH_ORIGIN);
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://jznepeqghjixcrpuddym.supabase.co");
});
afterAll(async () => {
  await connection`delete from organizations where owner_id = any(${made.map((user) => user.id)})`;
  await connection`delete from profiles where id = any(${made.map((user) => user.id)})`;
});

async function makeUser(label: string) {
  const user = await createTestUser(label);
  made.push(user);
  return user;
}

/** A browser holding this session's cookies, as Playwright's context holds them. */
function browserWith(cookies: { name: string; value: string }[]) {
  const browser = new AuthBrowser();
  for (const { name, value } of cookies) browser.cookies.set(name, value);
  return browser;
}
const sessionOf = (browser: AuthBrowser) => browser.action(() => readSession());
const browserFor = async (user: TestUser, orgId?: string) => browserWith(await testSessionCookies(user.id, orgId));
const rows = async (table: string, column: string, id: string) =>
  Number((await connection`select count(*) from ${connection(table)} where ${connection(column)} = ${id}`)[0].count);

describe("people", () => {
  it("have an address at Resend's test recipient, their own, and their confirmed password signs in through the real form", async () => {
    fakeOutbound();
    const user = await makeUser("Sign-in PM");
    const other = await makeUser("Sign-in PM");
    expect(user.email).toMatch(/^delivered\+lane-e2e-[0-9a-f]{8}-\d+-sign-in-pm@resend\.dev$/);
    expect(other.email).not.toBe(user.email);
    const browser = new AuthBrowser();
    expect(await signIn(browser, user)).toMatchObject({ status: 200, body: { user: { id: user.id, email: user.email } } });
    expect(codeOf(await signIn(new AuthBrowser(), { ...user, password: "not-their-password" }))).toBe("INVALID_EMAIL_OR_PASSWORD");
  });

  it("have addresses another worker's run never makes, within an address's length", async () => {
    const label = "a-label-longer-than-any-spec-uses-so-far-in-this-suite";
    const here = testEmail(label);
    vi.resetModules();
    const otherWorker = await import("../../e2e/helpers/fixtures");
    const there = otherWorker.testEmail(label);
    expect(there).not.toBe(here);
    expect(here.split("@")[0].length).toBeLessThanOrEqual(64);
  });

  it("are signed in by a cookie the app's session seam reads, in the workspace it names", async () => {
    const user = await makeUser("seam");
    const first = await createTestWorkspace(user.id, "Seam one");
    const second = await createTestWorkspace(user.id, "Seam two");
    expect(await sessionOf(await browserFor(user, first))).toEqual({ userId: user.id, orgId: first, role: "admin" });
    // Last used, as Lane's create leaves it, when the session names none.
    expect(await sessionOf(await browserFor(user))).toEqual({ userId: user.id, orgId: second, role: "admin" });
  });

  it("sign a page's browser in, in place of whoever was", async () => {
    const [one, two] = [await makeUser("page-one"), await makeUser("page-two")];
    const jar = new Map<string, { name: string; value: string }>();
    const context = { addCookies: async (cookies: { name: string; value: string }[]) => { for (const cookie of cookies) jar.set(cookie.name, cookie); } };
    const page = { context: () => context as unknown as BrowserContext } as Page;
    await signInTestUser(page, one);
    expect(await sessionOf(browserWith([...jar.values()]))).toMatchObject({ userId: one.id, orgId: null });
    await signInTestUser(page, two);
    expect(await sessionOf(browserWith([...jar.values()]))).toMatchObject({ userId: two.id, orgId: null });
    await expect(signInTestUser(page, { email: "stranger@example.com" })).rejects.toThrow(/no creation receipt/);
  });
});

describe("workspaces", () => {
  it("have their creator, a slug and no logo or metadata, and their creator is their Admin", async () => {
    const user = await makeUser("workspace");
    const orgId = await createTestWorkspace(user.id, "Fixture workspace");
    const [row] = await connection`select name, owner_id, slug, logo, metadata, plan, last_request_number from organizations where id = ${orgId}`;
    expect(row).toEqual({ name: "Fixture workspace", owner_id: user.id, slug: expect.stringMatching(/.+/), logo: null, metadata: null, plan: "free", last_request_number: 0 });
  });

  it("take Lane's four roles and no other, and a change or a removal applies on the next read", async () => {
    const [admin, joiner] = [await makeUser("roles-admin"), await makeUser("roles-joiner")];
    const orgId = await createTestWorkspace(admin.id, "Roles");
    for (const role of ["owner", "org:member", "admin,member", ""]) await expect(addTestMember(orgId, joiner.id, role as WorkspaceRole)).rejects.toThrow(/admin, member, guest or viewer/);
    await addTestMember(orgId, joiner.id, "guest");
    const browser = await browserFor(joiner, orgId);
    for (const role of ["admin", "member", "viewer", "guest"] as const) {
      await setTestMemberRole(orgId, joiner.id, role);
      expect(await sessionOf(browser)).toEqual({ userId: joiner.id, orgId, role });
    }
    await expect(setTestMemberRole(orgId, joiner.id, "owner" as WorkspaceRole)).rejects.toThrow(/admin, member, guest or viewer/);
    await removeTestMember(orgId, joiner.id);
    expect(await sessionOf(browser)).toEqual({ userId: joiner.id, orgId: null, role: null });
  });

  it("refuse a stranger's workspace, and a stranger in one of ours", async () => {
    const outbound = fakeOutbound();
    const stranger = await signedIn(outbound, "stranger");
    const theirs = await createWorkspace(stranger.browser);
    const user = await makeUser("refused");
    const ours = await createTestWorkspace(user.id, "Ours");
    for (const attempt of [
      () => addTestMember(theirs, user.id, "member"),
      () => addTestMember(ours, stranger.userId, "member"),
      () => setTestMemberRole(theirs, stranger.userId, "guest"),
      () => removeTestMember(theirs, stranger.userId),
      () => createTestWorkspace(stranger.userId, "Not theirs"),
    ]) await expect(attempt()).rejects.toThrow(/no creation receipt/);
    expect(await sessionOf(stranger.browser)).toEqual({ userId: stranger.userId, orgId: theirs, role: "admin" });
  });
});

describe("cleanup", () => {
  it("deletes the person, their workspaces, sessions, sign-in methods and codes, and nothing else", async () => {
    const outbound = fakeOutbound();
    const bystander = await makeUser("bystander");
    const bystanders = await createTestWorkspace(bystander.id, "Bystander's");
    const user = await makeUser("cleanup");
    const orgId = await provisionTestWorkspace({ userId: user.id, email: user.email, name: "Cleanup PM", workspaceName: "Cleanup", role: "pm" });
    await addTestMember(orgId, bystander.id, "member");
    const { id: requestId } = await seedTestRequest(user.id, "A Request in the workspace");
    await new AuthBrowser().post("/email-otp/send-verification-otp", { email: user.email, type: "sign-in" });
    expect(outbound.emailsTo(user.email)).toHaveLength(1);
    await browserFor(user, orgId);

    await cleanupTestWorkspace(user.id);
    await deleteTestUser(user.id);
    expect(await rows("profiles", "id", user.id)).toBe(0);
    expect(await rows("organizations", "id", orgId)).toBe(0);
    expect(await rows("requests", "id", requestId)).toBe(0);
    for (const table of ["session", "account", "member"]) expect(await rows(table, "user_id", user.id), table).toBe(0);
    expect(await rows("verification", "identifier", `sign-in-otp-${user.email}`)).toBe(0);
    expect(await sessionOf(await browserFor(bystander, bystanders))).toEqual({ userId: bystander.id, orgId: bystanders, role: "admin" });
    // Their receipts are gone with them.
    await expect(deleteTestUser(user.id)).rejects.toThrow(/no creation receipt/);
  });

  it("refuses a person and a workspace another run made", async () => {
    const outbound = fakeOutbound();
    const stranger = await signedIn(outbound, "kept");
    const theirs = await createWorkspace(stranger.browser);
    await expect(deleteTestUser(stranger.userId)).rejects.toThrow(/no creation receipt/);
    await expect(cleanupTestWorkspace(stranger.userId)).rejects.toThrow(/no creation receipt/);
    await expect(deleteTestWorkspace(theirs)).rejects.toThrow(/no creation receipt/);
    expect(await sessionOf(stranger.browser)).toEqual({ userId: stranger.userId, orgId: theirs, role: "admin" });
  });

  it("refuses a person who is in a workspace this run didn't make, and deletes nothing", async () => {
    const outbound = fakeOutbound();
    const stranger = await signedIn(outbound, "host");
    const theirs = await createWorkspace(stranger.browser);
    const user = await makeUser("visitor");
    const ours = await createTestWorkspace(user.id, "Visitor's");
    await connection`insert into member (id, organization_id, user_id, role, created_at) values (${randomUUID()}, ${theirs}, ${user.id}, 'member', now())`;
    await expect(cleanupTestWorkspace(user.id)).rejects.toThrow(/didn't make/);
    await expect(deleteTestUser(user.id)).rejects.toThrow(/didn't make/);
    expect(await rows("organizations", "id", ours)).toBe(1);
    expect(await rows("member", "user_id", user.id)).toBe(2);
  });

  it("refuses a person whose address no longer carries the run's prefix, and a workspace whose creator changed", async () => {
    const [user, other] = [await makeUser("renamed"), await makeUser("creator-changed")];
    const orgId = await createTestWorkspace(other.id, "Changed hands");
    await connection`update organizations set owner_id = ${user.id} where id = ${orgId}`;
    await expect(assertOwnedOrganization(orgId)).rejects.toThrow(/does not match/);
    await expect(deleteTestWorkspace(orgId)).rejects.toThrow(/does not match/);
    await connection`update profiles set email = ${`${randomUUID()}@example.com`} where id = ${user.id}`;
    await expect(deleteTestUser(user.id)).rejects.toThrow(/run's prefix/);
    expect(await rows("profiles", "id", user.id)).toBe(1);
    expect(await rows("organizations", "id", orgId)).toBe(1);
  });

  it("keeps a workspace whose history can't be deleted, and ends its person's sessions and sign-in methods", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const user = await makeUser("history");
    const orgId = await provisionTestWorkspace({ userId: user.id, email: user.email, name: "History PM", workspaceName: "History" });
    const { id } = await seedTestRequest(user.id, "A closed Request");
    const closure = { operationId: randomUUID(), fingerprint: "a".repeat(64), actorId: user.id, revision: 1 };
    await connection`update requests set status = 'done', agreement_revision = 1, exception_closure = ${connection.json({ ...closure, version: 1, kind: "exception", reasonCode: "other", reason: "Never launched", ownerId: user.id, closedAt: "2026-11-24T00:00:00.000Z", release: null })} where id = ${id}`;
    const browser = await browserFor(user, orgId);
    try {
      await expect(cleanupTestWorkspace(user.id)).rejects.toThrow("Closed Request is immutable");
      await deleteTestUser(user.id);
      expect(await rows("organizations", "id", orgId)).toBe(1);
      expect(await rows("profiles", "id", user.id)).toBe(1);
      expect(await sessionOf(browser)).toBeNull();
      expect(await rows("account", "user_id", user.id)).toBe(0);
    } finally {
      // This file's own row, gone with the test.
      await connection.begin(async (tx) => {
        await tx`set local session_replication_role = replica`;
        await tx`delete from requests where id = ${id}`;
      });
    }
  });

  it("keeps a teammate a workspace's rows still name until that workspace goes", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const [owner, teammate] = [await makeUser("keeps-owner"), await makeUser("keeps-teammate")];
    const orgId = await createTestWorkspace(owner.id, "Keeps");
    await addTestMember(orgId, teammate.id, "member");
    await connection`insert into requests (org_id, title, description, status, created_by) values (${orgId}, 'Theirs', 'A Request the teammate filed.', 'open', ${teammate.id})`;
    await deleteTestUser(teammate.id);
    expect(await rows("profiles", "id", teammate.id)).toBe(1);
    expect(await rows("account", "user_id", teammate.id)).toBe(0);
    await deleteTestUser(owner.id);
    expect(await rows("organizations", "id", orgId)).toBe(0);
  });
});

describe("people and workspaces the browser made", () => {
  it("are this run's once registered at a reserved address, and only then", async () => {
    const outbound = fakeOutbound();
    const email = testEmail("browser-made");
    const browser = new AuthBrowser();
    const signedUp = await signUp({ email, password: "lane-e2e-fixtures-password", name: "Browser Made" }, browser);
    const id = (signedUp.body as { user: { id: string } }).user.id;
    made.push({ id, email, password: "" });
    await expect(registerBrowserTestUser(id, "stranger@example.com")).rejects.toThrow(/not reserved/);
    await expect(registerBrowserTestUser(id, testEmail("another"))).rejects.toThrow(/not the newly created/);
    await registerBrowserTestUser(id, email);
    expect(outbound.emailsTo(email)).toHaveLength(1);

    const code = await replaceEmailCode(email, "email-verification");
    expect(await browser.post("/email-otp/verify-email", { email, otp: code })).toMatchObject({ status: 200 });
    const orgId = await createWorkspace(browser);
    await connection`update organizations set owner_id = ${id} where id = ${orgId}`;
    await expect(registerBrowserTestOrganization(orgId, id, "Another name")).rejects.toThrow(/not the newly created/);
    await registerBrowserTestOrganization(orgId, id, "Wren's studio");
    await deleteTestUser(id);
    expect(await rows("organizations", "id", orgId)).toBe(0);
    expect(await rows("profiles", "id", id)).toBe(0);
  });
});

describe("email codes", () => {
  it.each([["sign-in", "/email-otp/send-verification-otp"], ["forget-password", "/email-otp/request-password-reset"]] as const)("a chosen %s code replaces the emailed one", async (type, path) => {
    const outbound = fakeOutbound();
    const user = await makeUser("codes");
    const browser = new AuthBrowser();
    await browser.post(path, { email: user.email, type });
    const emailed = outbound.codeFor(user.email);
    const code = await replaceEmailCode(user.email, type, "135790");
    expect(code).toBe("135790");
    const enter = (otp: string) => type === "sign-in"
      ? browser.post("/sign-in/email-otp", { email: user.email, otp })
      : browser.post("/email-otp/reset-password", { email: user.email, otp, password: "a-new-lane-e2e-password" });
    expect(codeOf(await enter(emailed))).toBe("INVALID_OTP");
    expect(await enter(code)).toMatchObject({ status: 200 });
  });

  it("are replaced only where one is waiting, at an address this worker reserved", async () => {
    const outbound = fakeOutbound();
    const user = await makeUser("no-code");
    await expect(replaceEmailCode(user.email, "sign-in")).rejects.toThrow(/No sign-in code is waiting/);
    const stranger = person("stranger-code");
    await signUp(stranger);
    await expect(replaceEmailCode(stranger.email, "email-verification")).rejects.toThrow(/not reserved/);
    expect(outbound.emailsTo(stranger.email)).toHaveLength(1);
  });
});

describe("the proof Playwright's setup runs against the app", () => {
  /** Sends the proof's call to the app's own route, whose env is the app's. */
  function appWith(env: Partial<typeof TEST_AUTH_ENV>) {
    vi.stubGlobal("fetch", async (url: string, { headers }: { headers: { cookie: string } }) => {
      const { GET } = await import("@/app/api/auth/[...all]/route");
      const own = process.env.BETTER_AUTH_SECRET;
      for (const [name, value] of Object.entries(env)) process.env[name] = value;
      try {
        return await GET(new Request(url, { headers }));
      } finally {
        process.env.BETTER_AUTH_SECRET = own;
      }
    });
  }
  const setupPeople = async () => Number((await connection`select count(*) from profiles where email like ${"delivered+lane-e2e-%-setup@resend.dev"}`)[0].count);

  it("passes with the app's own secret, address, database and mapping, and leaves nothing behind", async () => {
    appWith({});
    await proveAppAcceptsTestSessions();
    expect(await setupPeople()).toBe(0);
  });

  it("says the app's secret isn't this run's, without naming either, and leaves nothing behind", async () => {
    const secret = "made-up-app-secret-that-is-not-the-run-s-0003";
    appWith({ BETTER_AUTH_SECRET: secret as never });
    const refusal = await proveAppAcceptsTestSessions().then(() => null, (error: Error) => error.message);
    expect(refusal).toMatch(/^\[e2e\] http:\/\/localhost:3000 doesn't accept this run's test sessions: its BETTER_AUTH_SECRET is not this run's/);
    expect(refusal).not.toContain(secret);
    expect(refusal).not.toContain(TEST_AUTH_ENV.BETTER_AUTH_SECRET);
    expect(await setupPeople()).toBe(0);
  });

  it("says when the app's auth is off", async () => {
    appWith({ BETTER_AUTH_SECRET: "" as never });
    await expect(proveAppAcceptsTestSessions()).rejects.toThrow(/no BETTER_AUTH_SECRET/);
  });
});
