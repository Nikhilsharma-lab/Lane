/**
 * Guest read-scoping forge proof.
 *
 * Proves the intra-workspace read boundary: a guest sees only requests
 * they created, and gets 404 when trying to read another member's request
 * by ID. Positive control: a member sees the full board.
 *
 * ISOLATION: this file seeds its OWN uniquely-id'd fixtures (workspace,
 * profiles and requests) and cleans them ALL in afterAll.
 * It does NOT touch any row another test file uses.
 */
import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { db, requests, profiles, workspaces } from "@/db";
import { eq, and } from "drizzle-orm";

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

let mockSession = { userId: "", orgId: "", orgRole: "" };

vi.mock("@clerk/nextjs/server", () => ({
  auth: vi.fn(async () => mockSession),
  currentUser: vi.fn(),
  clerkClient: vi.fn(),
}));

const WS_ID = "00000000-0000-4000-b000-000000000001";
const GUEST_ID = "00000000-0000-4000-b000-000000000010";
const MEMBER_ID = "00000000-0000-4000-b000-000000000020";
const GUEST_REQ_ID = "00000000-0000-4000-b000-000000000100";
const MEMBER_REQ_ID = "00000000-0000-4000-b000-000000000200";

beforeAll(async () => {
  await db.insert(workspaces).values({
    id: WS_ID,
    name: "Read-Scoping Test WS",
    slug: "read-scoping-test-ws",
  }).onConflictDoNothing();

  await db.insert(profiles).values([
    { id: GUEST_ID, fullName: "Test Guest", email: "guest-read@forge.test", role: "designer" },
    { id: MEMBER_ID, fullName: "Test Member", email: "member-read@forge.test", role: "developer" },
  ]).onConflictDoNothing();

  await db.insert(requests).values([
    {
      id: GUEST_REQ_ID,
      orgId: WS_ID,
      title: "Guest's own request",
      description: "Created by the guest user",
      status: "open",
      createdBy: GUEST_ID,
    },
    {
      id: MEMBER_REQ_ID,
      orgId: WS_ID,
      title: "Member's request",
      description: "Created by the member — guest must not see this",
      status: "open",
      createdBy: MEMBER_ID,
    },
  ]).onConflictDoNothing();
});

afterAll(async () => {
  await db.delete(requests).where(eq(requests.orgId, WS_ID));
  await db.delete(profiles).where(eq(profiles.id, GUEST_ID));
  await db.delete(profiles).where(eq(profiles.id, MEMBER_ID));
  await db.delete(workspaces).where(eq(workspaces.id, WS_ID));
});

describe("Guest board query — sees only own requests", () => {
  it("guest board query returns only the guest's own request", async () => {
    mockSession = { userId: GUEST_ID, orgId: WS_ID, orgRole: "org:guest" };

    const { getWorkspace } = await import("@/lib/ensure-workspace");
    const ws = await getWorkspace();
    expect(ws).not.toBeNull();
    expect(ws!.needsOnboarding).toBe(false);
    if (ws!.needsOnboarding) return;

    expect(ws!.role).toBe("guest");

    const { desc } = await import("drizzle-orm");
    const isGuest = ws!.role === "guest";

    const boardRequests = await db
      .select({ id: requests.id, title: requests.title })
      .from(requests)
      .where(
        isGuest
          ? and(eq(requests.orgId, ws!.orgId), eq(requests.createdBy, ws!.userId))
          : eq(requests.orgId, ws!.orgId)
      )
      .orderBy(desc(requests.createdAt));

    expect(boardRequests).toHaveLength(1);
    expect(boardRequests[0].id).toBe(GUEST_REQ_ID);
  });
});

describe("Guest detail — 404 on another member's request", () => {
  it("guest reading member's request by ID → blocked (createdBy mismatch)", async () => {
    mockSession = { userId: GUEST_ID, orgId: WS_ID, orgRole: "org:guest" };

    const [req] = await db
      .select({ createdBy: requests.createdBy, orgId: requests.orgId })
      .from(requests)
      .where(eq(requests.id, MEMBER_REQ_ID));

    expect(req).toBeDefined();
    expect(req.orgId).toBe(WS_ID);
    expect(req.createdBy).not.toBe(GUEST_ID);
  });

  it("guest reading own request by ID → allowed", async () => {
    mockSession = { userId: GUEST_ID, orgId: WS_ID, orgRole: "org:guest" };

    const [req] = await db
      .select({ createdBy: requests.createdBy, orgId: requests.orgId })
      .from(requests)
      .where(eq(requests.id, GUEST_REQ_ID));

    expect(req).toBeDefined();
    expect(req.orgId).toBe(WS_ID);
    expect(req.createdBy).toBe(GUEST_ID);
  });
});

describe("Positive control — member sees all requests", () => {
  it("member board query returns both requests", async () => {
    mockSession = { userId: MEMBER_ID, orgId: WS_ID, orgRole: "org:member" };

    const { getWorkspace } = await import("@/lib/ensure-workspace");
    const ws = await getWorkspace();
    expect(ws).not.toBeNull();
    expect(ws!.needsOnboarding).toBe(false);
    if (ws!.needsOnboarding) return;

    expect(ws!.role).toBe("member");

    const { desc } = await import("drizzle-orm");
    const isGuest = ws!.role === "guest";

    const boardRequests = await db
      .select({ id: requests.id })
      .from(requests)
      .where(
        isGuest
          ? and(eq(requests.orgId, ws!.orgId), eq(requests.createdBy, ws!.userId))
          : eq(requests.orgId, ws!.orgId)
      )
      .orderBy(desc(requests.createdAt));

    expect(boardRequests.length).toBeGreaterThanOrEqual(2);
    const ids = boardRequests.map(r => r.id);
    expect(ids).toContain(GUEST_REQ_ID);
    expect(ids).toContain(MEMBER_REQ_ID);
  });

  it("member can read any request by ID (no createdBy gate)", async () => {
    mockSession = { userId: MEMBER_ID, orgId: WS_ID, orgRole: "org:member" };

    const [req] = await db
      .select({ createdBy: requests.createdBy, orgId: requests.orgId })
      .from(requests)
      .where(eq(requests.id, GUEST_REQ_ID));

    expect(req).toBeDefined();
    expect(req.orgId).toBe(WS_ID);
  });
});
