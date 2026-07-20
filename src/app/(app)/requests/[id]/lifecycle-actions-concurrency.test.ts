import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import {
  db,
  notifications,
  profiles,
  requests,
  workspaceMembers,
  workspaces,
} from "@/db";
import { and, eq } from "drizzle-orm";

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

type SessionUser = { id: string; email?: string };
let sessionQueue: SessionUser[] = [];

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => {
    const user = sessionQueue.shift() ?? null;
    return {
      auth: {
        getUser: async () => ({
          data: { user },
          error: user ? null : { message: "Not authenticated" },
        }),
      },
    };
  }),
}));

const WORKSPACE_ID = "00000000-0000-4000-a000-00000000a101";
const REQUESTER_ID = "00000000-0000-4000-a000-00000000a110";
const FIRST_MEMBER_ID = "00000000-0000-4000-a000-00000000a120";
const SECOND_MEMBER_ID = "00000000-0000-4000-a000-00000000a130";
const REQUEST_ID = "00000000-0000-4000-a000-00000000a140";

beforeAll(async () => {
  await db.insert(workspaces).values({
    id: WORKSPACE_ID,
    name: "Lifecycle Concurrency",
    slug: "lifecycle-concurrency",
  });
  await db.insert(profiles).values([
    {
      id: REQUESTER_ID,
      orgId: WORKSPACE_ID,
      fullName: "Requester",
      email: "requester@lifecycle.test",
      role: "pm",
    },
    {
      id: FIRST_MEMBER_ID,
      orgId: WORKSPACE_ID,
      fullName: "First Member",
      email: "first@lifecycle.test",
      role: "designer",
    },
    {
      id: SECOND_MEMBER_ID,
      orgId: WORKSPACE_ID,
      fullName: "Second Member",
      email: "second@lifecycle.test",
      role: "developer",
    },
  ]);
  await db.insert(workspaceMembers).values([
    {
      workspaceId: WORKSPACE_ID,
      userId: REQUESTER_ID,
      role: "member",
      isActive: true,
    },
    {
      workspaceId: WORKSPACE_ID,
      userId: FIRST_MEMBER_ID,
      role: "member",
      isActive: true,
    },
    {
      workspaceId: WORKSPACE_ID,
      userId: SECOND_MEMBER_ID,
      role: "member",
      isActive: true,
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
});

afterAll(async () => {
  await db
    .delete(notifications)
    .where(eq(notifications.orgId, WORKSPACE_ID));
  await db.delete(requests).where(eq(requests.orgId, WORKSPACE_ID));
  await db
    .delete(workspaceMembers)
    .where(eq(workspaceMembers.workspaceId, WORKSPACE_ID));
  await db.delete(profiles).where(eq(profiles.orgId, WORKSPACE_ID));
  await db.delete(workspaces).where(eq(workspaces.id, WORKSPACE_ID));
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
      { id: FIRST_MEMBER_ID },
      { id: SECOND_MEMBER_ID },
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
      { id: FIRST_MEMBER_ID },
      { id: SECOND_MEMBER_ID },
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
