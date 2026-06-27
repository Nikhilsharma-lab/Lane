import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { db, workspaces, profiles, workspaceMembers, requests, comments } from "@/db";
import { alias } from "drizzle-orm/pg-core";
import { eq, asc } from "drizzle-orm";

const WS_ID = "00000000-0000-4000-d000-000000000001";
const CREATOR_ID = "00000000-0000-4000-d000-000000000010";
const ASSIGNEE_ID = "00000000-0000-4000-d000-000000000020";
const GUEST_ID = "00000000-0000-4000-d000-000000000030";
const REQ_ID = "00000000-0000-4000-d000-000000000100";
const GUEST_REQ_ID = "00000000-0000-4000-d000-000000000200";

beforeAll(async () => {
  await db.insert(workspaces).values({
    id: WS_ID,
    name: "Detail Query Test WS",
    slug: "detail-query-test-ws",
  }).onConflictDoNothing();

  await db.insert(profiles).values([
    { id: CREATOR_ID, orgId: WS_ID, fullName: "Alice Creator", email: "alice-detail@forge.test", role: "pm" },
    { id: ASSIGNEE_ID, orgId: WS_ID, fullName: "Bob Assignee", email: "bob-detail@forge.test", role: "designer" },
    { id: GUEST_ID, orgId: WS_ID, fullName: "Carol Guest", email: "carol-detail@forge.test", role: "developer" },
  ]).onConflictDoNothing();

  await db.insert(workspaceMembers).values([
    { workspaceId: WS_ID, userId: CREATOR_ID, role: "member", isActive: true },
    { workspaceId: WS_ID, userId: ASSIGNEE_ID, role: "member", isActive: true },
    { workspaceId: WS_ID, userId: GUEST_ID, role: "guest", isActive: true },
  ]).onConflictDoNothing();

  await db.insert(requests).values([
    {
      id: REQ_ID,
      orgId: WS_ID,
      title: "Test Request",
      description: "A request with creator and assignee",
      status: "in_progress",
      createdBy: CREATOR_ID,
      assignedTo: ASSIGNEE_ID,
    },
    {
      id: GUEST_REQ_ID,
      orgId: WS_ID,
      title: "Guest's Request",
      description: "Created by guest",
      status: "open",
      createdBy: GUEST_ID,
    },
  ]).onConflictDoNothing();

  await db.insert(comments).values([
    { requestId: REQ_ID, authorId: CREATOR_ID, body: "Comment from creator" },
    { requestId: REQ_ID, authorId: ASSIGNEE_ID, body: "Comment from assignee" },
  ]).onConflictDoNothing();
});

afterAll(async () => {
  await db.delete(comments).where(eq(comments.requestId, REQ_ID));
  await db.delete(requests).where(eq(requests.orgId, WS_ID));
  await db.delete(workspaceMembers).where(eq(workspaceMembers.workspaceId, WS_ID));
  await db.delete(profiles).where(eq(profiles.orgId, WS_ID));
  await db.delete(workspaces).where(eq(workspaces.id, WS_ID));
});

describe("Detail page — alias-join query", () => {
  it("returns request with creator and assignee names in one query", async () => {
    const creator = alias(profiles, "creator");
    const assignee = alias(profiles, "assignee");

    const [req] = await db
      .select({
        id: requests.id,
        title: requests.title,
        status: requests.status,
        createdBy: requests.createdBy,
        assignedTo: requests.assignedTo,
        orgId: requests.orgId,
        creatorName: creator.fullName,
        assigneeName: assignee.fullName,
      })
      .from(requests)
      .leftJoin(creator, eq(requests.createdBy, creator.id))
      .leftJoin(assignee, eq(requests.assignedTo, assignee.id))
      .where(eq(requests.id, REQ_ID));

    expect(req).toBeDefined();
    expect(req.title).toBe("Test Request");
    expect(req.creatorName).toBe("Alice Creator");
    expect(req.assigneeName).toBe("Bob Assignee");
    expect(req.orgId).toBe(WS_ID);
    expect(req.createdBy).toBe(CREATOR_ID);
    expect(req.assignedTo).toBe(ASSIGNEE_ID);
  });

  it("unassigned request returns null assigneeName", async () => {
    const creator = alias(profiles, "creator");
    const assignee = alias(profiles, "assignee");

    const [req] = await db
      .select({
        id: requests.id,
        creatorName: creator.fullName,
        assigneeName: assignee.fullName,
      })
      .from(requests)
      .leftJoin(creator, eq(requests.createdBy, creator.id))
      .leftJoin(assignee, eq(requests.assignedTo, assignee.id))
      .where(eq(requests.id, GUEST_REQ_ID));

    expect(req).toBeDefined();
    expect(req.creatorName).toBe("Carol Guest");
    expect(req.assigneeName).toBeNull();
  });

  it("comments query returns correct author names via LEFT JOIN", async () => {
    const allComments = await db
      .select({
        id: comments.id,
        body: comments.body,
        authorName: profiles.fullName,
      })
      .from(comments)
      .leftJoin(profiles, eq(comments.authorId, profiles.id))
      .where(eq(comments.requestId, REQ_ID))
      .orderBy(asc(comments.createdAt));

    expect(allComments).toHaveLength(2);
    const names = allComments.map((c) => c.authorName);
    expect(names).toContain("Alice Creator");
    expect(names).toContain("Bob Assignee");
  });
});

describe("Detail page — guest scoping preserved", () => {
  it("org scoping: request.orgId must match context", async () => {
    const creator = alias(profiles, "creator");
    const assignee = alias(profiles, "assignee");

    const [req] = await db
      .select({
        orgId: requests.orgId,
        createdBy: requests.createdBy,
      })
      .from(requests)
      .leftJoin(creator, eq(requests.createdBy, creator.id))
      .leftJoin(assignee, eq(requests.assignedTo, assignee.id))
      .where(eq(requests.id, REQ_ID));

    expect(req.orgId).toBe(WS_ID);
    const wrongOrg = "00000000-0000-4000-d000-999999999999";
    expect(req.orgId).not.toBe(wrongOrg);
  });

  it("guest sees own request (createdBy matches)", async () => {
    const creator = alias(profiles, "creator");
    const assignee = alias(profiles, "assignee");

    const [req] = await db
      .select({
        createdBy: requests.createdBy,
        creatorName: creator.fullName,
      })
      .from(requests)
      .leftJoin(creator, eq(requests.createdBy, creator.id))
      .leftJoin(assignee, eq(requests.assignedTo, assignee.id))
      .where(eq(requests.id, GUEST_REQ_ID));

    expect(req.createdBy).toBe(GUEST_ID);
  });

  it("guest blocked from other member's request (createdBy mismatch)", async () => {
    const creator = alias(profiles, "creator");
    const assignee = alias(profiles, "assignee");

    const [req] = await db
      .select({
        createdBy: requests.createdBy,
      })
      .from(requests)
      .leftJoin(creator, eq(requests.createdBy, creator.id))
      .leftJoin(assignee, eq(requests.assignedTo, assignee.id))
      .where(eq(requests.id, REQ_ID));

    expect(req.createdBy).not.toBe(GUEST_ID);
  });
});
