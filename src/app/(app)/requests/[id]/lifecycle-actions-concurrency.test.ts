import { fixtureClerkClient } from "@/test/member-fixtures";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import {
  db,
  comments,
  notifications,
  profiles,
  requests,
  workspaces,
} from "@/db";
import { and, eq, inArray } from "drizzle-orm";

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

type Session = { userId: string; orgId: string; orgRole: "org:member" | "org:guest" };
let sessionQueue: Session[] = [];

vi.mock("@clerk/nextjs/server", () => ({
  clerkClient: async () => fixtureClerkClient(WORKSPACE_ID, [REQUESTER_ID,FIRST_MEMBER_ID,SECOND_MEMBER_ID]),
  auth: vi.fn(async () =>
    sessionQueue.shift() ?? { userId: null, orgId: null, orgRole: null }
  ),
}));

const WORKSPACE_ID = "00000000-0000-4000-a000-00000000a101";
const REQUESTER_ID = "00000000-0000-4000-a000-00000000a110";
const FIRST_MEMBER_ID = "00000000-0000-4000-a000-00000000a120";
const SECOND_MEMBER_ID = "00000000-0000-4000-a000-00000000a130";
const REQUEST_ID = "00000000-0000-4000-a000-00000000a140";
const OTHER_WORKSPACE_ID = "00000000-0000-4000-a000-00000000a102";
const FOREIGN_OPEN_ID = "00000000-0000-4000-a000-00000000a150";
const FOREIGN_PROGRESS_ID = "00000000-0000-4000-a000-00000000a160";
const FOREIGN_DONE_ID = "00000000-0000-4000-a000-00000000a170";
const GUEST_REQUEST_ID = "00000000-0000-4000-a000-00000000a180";
const MISSING_REQUEST_ID = "00000000-0000-4000-a000-00000000a190";

beforeAll(async () => {
  await db.insert(workspaces).values({
    id: WORKSPACE_ID,
    name: "Lifecycle Concurrency",
    slug: "lifecycle-concurrency",
  });
  await db.insert(workspaces).values({
    id: OTHER_WORKSPACE_ID,
    name: "Lifecycle Hidden Requests",
    slug: "lifecycle-hidden-requests",
  });
  await db.insert(profiles).values([
    {
      id: REQUESTER_ID,
      fullName: "Requester",
      email: "requester@lifecycle.test",
      role: "pm",
    },
    {
      id: FIRST_MEMBER_ID,
      fullName: "First Member",
      email: "first@lifecycle.test",
      role: "designer",
    },
    {
      id: SECOND_MEMBER_ID,
      fullName: "Second Member",
      email: "second@lifecycle.test",
      role: "developer",
    },
  ]);
  await db.insert(requests).values({
    id: REQUEST_ID,
    orgId: WORKSPACE_ID,
    title: "Only one lifecycle transition may win",
    description: "Concurrency proof",
    status: "open",
    createdBy: REQUESTER_ID,
  });
  await db.insert(requests).values([
    ...[
      { id: FOREIGN_OPEN_ID, status: "open" as const },
      { id: FOREIGN_PROGRESS_ID, status: "in_progress" as const },
      { id: FOREIGN_DONE_ID, status: "done" as const },
    ].map(row => ({ ...row, orgId: OTHER_WORKSPACE_ID, title: "Hidden Request", description: "Visibility regression fixture", createdBy: REQUESTER_ID })),
    { id: GUEST_REQUEST_ID, orgId: WORKSPACE_ID, title: "Guest-owned Request", description: "Visibility regression fixture", createdBy: SECOND_MEMBER_ID },
  ]);
});

afterAll(async () => {
  await db
    .delete(notifications)
    .where(inArray(notifications.orgId, [WORKSPACE_ID, OTHER_WORKSPACE_ID]));
  await db.delete(requests).where(inArray(requests.orgId, [WORKSPACE_ID, OTHER_WORKSPACE_ID]));
  await db.delete(profiles).where(eq(profiles.id, REQUESTER_ID));
  await db.delete(profiles).where(eq(profiles.id, FIRST_MEMBER_ID));
  await db.delete(profiles).where(eq(profiles.id, SECOND_MEMBER_ID));
  await db.delete(workspaces).where(inArray(workspaces.id, [WORKSPACE_ID, OTHER_WORKSPACE_ID]));
});

function splitResults(
  results: Array<{ error?: string; success?: boolean }>
) {
  return {
    successes: results.filter((result) => result.success === true),
    failures: results.filter((result) => Boolean(result.error)),
  };
}

describe("atomic Request lifecycle transitions", () => {
  it("allows only one concurrent pickup and one pickup notification", async () => {
    sessionQueue = [
      { userId: FIRST_MEMBER_ID, orgId: WORKSPACE_ID, orgRole: "org:member" },
      { userId: SECOND_MEMBER_ID, orgId: WORKSPACE_ID, orgRole: "org:member" },
    ];
    const { pickUpRequest } = await import("./actions");

    const results = await Promise.all([
      pickUpRequest(REQUEST_ID, { orgId: WORKSPACE_ID }),
      pickUpRequest(REQUEST_ID, { orgId: WORKSPACE_ID }),
    ]);
    const { successes, failures } = splitResults(results);

    expect(successes).toHaveLength(1);
    expect(failures).toHaveLength(1);

    const [request] = await db
      .select({
        status: requests.status,
        assignedTo: requests.assignedTo,
      })
      .from(requests)
      .where(eq(requests.id, REQUEST_ID));
    expect(request.status).toBe("in_progress");
    expect([FIRST_MEMBER_ID, SECOND_MEMBER_ID]).toContain(request.assignedTo);

    const pickupNotifications = await db
      .select({ id: notifications.id })
      .from(notifications)
      .where(
        and(
          eq(notifications.requestId, REQUEST_ID),
          eq(notifications.type, "request_picked_up")
        )
      );
    expect(pickupNotifications).toHaveLength(1);
  });

  it("allows only one concurrent completion and one Done notification", async () => {
    sessionQueue = [
      { userId: FIRST_MEMBER_ID, orgId: WORKSPACE_ID, orgRole: "org:member" },
      { userId: SECOND_MEMBER_ID, orgId: WORKSPACE_ID, orgRole: "org:member" },
    ];
    const { markDone } = await import("./actions");

    const results = await Promise.all([
      markDone(REQUEST_ID, { orgId: WORKSPACE_ID }),
      markDone(REQUEST_ID, { orgId: WORKSPACE_ID }),
    ]);
    const { successes, failures } = splitResults(results);

    expect(successes).toHaveLength(1);
    expect(failures).toHaveLength(1);

    const [request] = await db
      .select({ status: requests.status })
      .from(requests)
      .where(eq(requests.id, REQUEST_ID));
    expect(request.status).toBe("done");

    const doneNotifications = await db
      .select({ id: notifications.id })
      .from(notifications)
      .where(
        and(
          eq(notifications.requestId, REQUEST_ID),
          eq(notifications.type, "request_done")
        )
      );
    expect(doneNotifications).toHaveLength(1);
  });
});

describe("Request visibility in rejected actions", () => {
  function actAs(role: Session["orgRole"] = "org:member") {
    sessionQueue = [{ userId: SECOND_MEMBER_ID, orgId: WORKSPACE_ID, orgRole: role }];
  }

  it.each([
    { action: "pickUpRequest" as const, hiddenId: FOREIGN_OPEN_ID, status: "open" },
    { action: "markDone" as const, hiddenId: FOREIGN_PROGRESS_ID, status: "in_progress" },
    { action: "undoMarkDone" as const, hiddenId: FOREIGN_DONE_ID, status: "done" },
  ])("$action returns the same denial for missing and foreign Requests without changing the hidden Request", async ({ action, hiddenId, status }) => {
    const actions = await import("./actions");
    for (const id of [MISSING_REQUEST_ID, hiddenId, "not-a-uuid"]) {
      actAs();
      expect(await actions[action](id, { orgId: WORKSPACE_ID })).toEqual({ error: "Not found" });
    }
    const [hidden] = await db.select({ status: requests.status, assignedTo: requests.assignedTo }).from(requests).where(eq(requests.id, hiddenId));
    expect(hidden).toEqual({ status, assignedTo: null });
    expect(await db.select({ id: notifications.id }).from(notifications).where(eq(notifications.requestId, hiddenId))).toEqual([]);
  });

  it.each([
    { action: "pickUpRequests" as const, hiddenId: FOREIGN_OPEN_ID, status: "open" },
    { action: "markDoneMany" as const, hiddenId: FOREIGN_PROGRESS_ID, status: "in_progress" },
  ])("$action gives missing and foreign IDs identical failure reasons", async ({ action, hiddenId, status }) => {
    const actions = await import("./actions");
    actAs();
    expect(await actions[action]([MISSING_REQUEST_ID, hiddenId], { orgId: WORKSPACE_ID })).toEqual({
      moved: [],
      failed: [{ id: MISSING_REQUEST_ID, error: "Not found" }, { id: hiddenId, error: "Not found" }],
    });
    const [hidden] = await db.select({ status: requests.status, assignedTo: requests.assignedTo }).from(requests).where(eq(requests.id, hiddenId));
    expect(hidden).toEqual({ status, assignedTo: null });
    expect(await db.select({ id: notifications.id }).from(notifications).where(eq(notifications.requestId, hiddenId))).toEqual([]);
  });

  it("guest comments do not distinguish another person's Request from a missing or foreign Request", async () => {
    const { addComment } = await import("./actions");
    const form = new FormData();
    form.set("body", "Visibility regression comment");
    for (const id of [MISSING_REQUEST_ID, REQUEST_ID, FOREIGN_OPEN_ID]) {
      actAs("org:guest");
      expect(await addComment(id, form, { orgId: WORKSPACE_ID })).toEqual({ error: "Not found" });
    }
    expect(await db.select({ id: comments.id }).from(comments).where(inArray(comments.requestId, [REQUEST_ID, FOREIGN_OPEN_ID]))).toEqual([]);
    // The same guest can still comment on their own Request.
    actAs("org:guest");
    expect(await addComment(GUEST_REQUEST_ID, form, { orgId: WORKSPACE_ID })).toMatchObject({ success: true });
    expect(await db.select({ authorId: comments.authorId, body: comments.body }).from(comments).where(eq(comments.requestId, GUEST_REQUEST_ID)))
      .toEqual([{ authorId: SECOND_MEMBER_ID, body: "Visibility regression comment" }]);
  });
});
