/**
 * Plan item 1.16: the read-only GET route handlers. Each route is called
 * directly with a Request; identity comes from the mocked Clerk auth(), so
 * the guards, the org scoping and the guest scoping are exercised against
 * lane_test rows.
 *
 * ISOLATION: seeds its own Requests, Project and notifications inside the
 * shared org_test_a / org_test_b fixtures and removes them in afterAll.
 * Assertions use containment, never exact counts.
 */
import { randomUUID } from "node:crypto";
import { inArray } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const session = vi.hoisted(() => ({ userId: null as string | null, orgId: null as string | null, orgRole: null as string | null }));
const clerk = vi.hoisted(() => ({
  memberships: [] as { userId: string; role: string; firstName: string; lastName: string }[],
  calls: [] as { userId?: string[]; query?: string }[],
}));
vi.mock("@clerk/nextjs/server", () => ({
  auth: async () => session,
  clerkClient: async () => ({
    organizations: {
      getOrganizationMembershipList: async (input: { organizationId: string; userId?: string[]; query?: string }) => {
        clerk.calls.push({ userId: input.userId, query: input.query });
        const data = clerk.memberships
          .filter(member => !input.userId || input.userId.includes(member.userId))
          .filter(member => !input.query || `${member.firstName} ${member.lastName}`.toLowerCase().includes(input.query.toLowerCase()))
          .map(member => ({ role: member.role, organization: { id: input.organizationId }, publicUserData: { userId: member.userId, firstName: member.firstName, lastName: member.lastName } }));
        return { totalCount: data.length, data };
      },
    },
  }),
}));

import { db, notifications, profiles, projects, requests } from "@/db";
import { GET as search } from "./search/route";
import { GET as reviewers } from "./reviewers/route";
import { GET as notificationList } from "./notifications/route";
import { GET as unread } from "./notifications/unread/route";

const ORG = "org_test_a", OTHER_ORG = "org_test_b";
const ADMIN = "user_test_admin_a", MEMBER = "user_test_member_a", OTHER_ADMIN = "user_test_admin_b";
const GUEST = "user_read_routes_guest";
const MARK = `Read route probe ${randomUUID().slice(0, 8)}`;
const memberRequest = randomUUID(), guestRequest = randomUUID(), foreignRequest = randomUUID(), project = randomUUID();
const notificationIds = Array.from({ length: 4 }, () => randomUUID());

const actAs = (userId: string | null, orgRole = "org:member", orgId: string | null = ORG) => { session.userId = userId; session.orgId = orgId; session.orgRole = orgRole; };
const get = (handler: (request: Request) => Promise<Response>, path: string, params: Record<string, string>) =>
  handler(new Request(`http://lane.test${path}?${new URLSearchParams(params)}`));

beforeAll(async () => {
  await db.insert(profiles).values({ id: GUEST, fullName: "Read Route Guest", email: "read-route-guest@test.local", role: "designer" }).onConflictDoNothing();
  await db.insert(requests).values([
    { id: memberRequest, orgId: ORG, title: `${MARK} member`, description: "Seeded by read-routes.test.ts", createdBy: MEMBER },
    { id: guestRequest, orgId: ORG, title: `${MARK} guest`, description: "Seeded by read-routes.test.ts", createdBy: GUEST },
    { id: foreignRequest, orgId: OTHER_ORG, title: `${MARK} foreign`, description: "Seeded by read-routes.test.ts", createdBy: OTHER_ADMIN },
  ]);
  await db.insert(projects).values({ id: project, orgId: ORG, name: `${MARK} project`, createdBy: MEMBER });
  await db.insert(notifications).values([
    { id: notificationIds[0], userId: MEMBER, orgId: ORG, type: "request_picked_up", requestId: memberRequest, actorId: ADMIN },
    { id: notificationIds[1], userId: MEMBER, orgId: ORG, type: "invite_accepted", requestId: null, actorId: ADMIN, readAt: new Date() },
    { id: notificationIds[2], userId: MEMBER, orgId: OTHER_ORG, type: "request_done", requestId: foreignRequest, actorId: OTHER_ADMIN },
    { id: notificationIds[3], userId: GUEST, orgId: ORG, type: "invite_accepted", requestId: null, actorId: ADMIN },
  ]);
});
beforeEach(() => {
  actAs(MEMBER);
  clerk.calls = [];
  clerk.memberships = [
    { userId: ADMIN, role: "org:admin", firstName: "Test", lastName: "Admin" },
    { userId: MEMBER, role: "org:member", firstName: "Test", lastName: "Member" },
  ];
});
afterAll(async () => {
  await db.delete(notifications).where(inArray(notifications.id, notificationIds));
  await db.delete(requests).where(inArray(requests.id, [memberRequest, guestRequest, foreignRequest]));
  await db.delete(projects).where(inArray(projects.id, [project]));
  await db.delete(profiles).where(inArray(profiles.id, [GUEST]));
});

describe("GET /api/search", () => {
  it("refuses a signed-out caller with 401 and a mismatched workspace with 403", async () => {
    actAs(null, "org:member", null);
    expect((await get(search, "/api/search", { org: ORG, q: MARK })).status).toBe(401);
    actAs(OTHER_ADMIN, "org:admin", OTHER_ORG);
    expect((await get(search, "/api/search", { org: ORG, q: MARK })).status).toBe(403);
    expect((await get(search, "/api/search", { q: MARK })).status).toBe(400);
  });

  it("returns the workspace's matches only, private and uncacheable", async () => {
    const response = await get(search, "/api/search", { org: ORG, q: MARK });
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    const body = await response.json();
    expect(body.success).toBe(true);
    const ids = body.requests.items.map((item: { id: string }) => item.id);
    expect(ids).toContain(memberRequest);
    expect(ids).toContain(guestRequest);
    expect(ids).not.toContain(foreignRequest);
    expect(body.projects.items.map((item: { id: string }) => item.id)).toContain(project);
  });

  it("shows a guest only their own Requests and rejects an invalid page", async () => {
    actAs(GUEST, "org:guest");
    const body = await (await get(search, "/api/search", { org: ORG, q: MARK })).json();
    expect(body.requests.items.map((item: { id: string }) => item.id)).toEqual([guestRequest]);
    expect((await get(search, "/api/search", { org: ORG, q: MARK, requestsPage: "-1" })).status).toBe(400);
  });
});

describe("GET /api/reviewers", () => {
  it("refuses signed-out callers, guests and other workspaces", async () => {
    actAs(null, "org:member", null);
    expect((await get(reviewers, "/api/reviewers", { org: ORG, request: memberRequest })).status).toBe(401);
    actAs(GUEST, "org:guest");
    expect((await get(reviewers, "/api/reviewers", { org: ORG, request: memberRequest })).status).toBe(403);
    actAs(OTHER_ADMIN, "org:admin", OTHER_ORG);
    expect((await get(reviewers, "/api/reviewers", { org: OTHER_ORG, request: memberRequest })).status).toBe(404);
    expect(clerk.calls).toEqual([]);
  });

  it("lists onboarded teammates other than the caller for a Request in the workspace", async () => {
    const response = await get(reviewers, "/api/reviewers", { org: ORG, request: memberRequest, q: "test" });
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(await response.json()).toEqual({ members: [{ id: ADMIN, name: "Test Admin" }] });
    expect(clerk.calls.at(-1)).toEqual({ userId: undefined, query: "test" });
    expect((await get(reviewers, "/api/reviewers", { org: ORG, request: "not-a-uuid" })).status).toBe(404);
  });
});

describe("GET /api/notifications", () => {
  it("refuses a signed-out caller with 401 and a mismatched workspace with 403", async () => {
    actAs(null, "org:member", null);
    expect((await get(notificationList, "/api/notifications", { org: ORG })).status).toBe(401);
    actAs(MEMBER, "org:member", OTHER_ORG);
    expect((await get(notificationList, "/api/notifications", { org: ORG })).status).toBe(403);
  });

  it("returns the caller's notifications for this workspace only", async () => {
    const response = await get(notificationList, "/api/notifications", { org: ORG });
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    const ids = (await response.json()).notifications.map((item: { id: string }) => item.id);
    expect(ids).toContain(notificationIds[0]);
    expect(ids).toContain(notificationIds[1]);
    expect(ids).not.toContain(notificationIds[2]);
    expect(ids).not.toContain(notificationIds[3]);
  });

  it("hides workspace-wide events from a guest", async () => {
    actAs(GUEST, "org:guest");
    const ids = (await (await get(notificationList, "/api/notifications", { org: ORG })).json()).notifications.map((item: { id: string }) => item.id);
    expect(ids).not.toContain(notificationIds[3]);
  });
});

describe("GET /api/notifications/unread", () => {
  it("refuses a signed-out caller with 401 and a mismatched workspace with 403", async () => {
    actAs(null, "org:member", null);
    expect((await get(unread, "/api/notifications/unread", { org: ORG })).status).toBe(401);
    actAs(OTHER_ADMIN, "org:admin", OTHER_ORG);
    expect((await get(unread, "/api/notifications/unread", { org: ORG })).status).toBe(403);
  });

  it("counts only unread notifications visible in this workspace", async () => {
    const response = await get(unread, "/api/notifications/unread", { org: ORG });
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    const { count } = await response.json();
    expect(count).toBeGreaterThanOrEqual(1);
    actAs(GUEST, "org:guest");
    // The guest's only notification is workspace-wide, which guests never see.
    expect(await (await get(unread, "/api/notifications/unread", { org: ORG })).json()).toEqual({ count: 0 });
  });
});
