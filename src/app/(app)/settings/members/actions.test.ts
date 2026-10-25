import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * #210 Settings → Members: Admins invite people as, and change people to, Admin, Member, Guest or Viewer. Clerk
 * keeps every membership and invitation; these actions only ask Clerk. Until Clerk Enhanced B2B is approved the
 * `LANE_CUSTOM_ROLES` switch stays off and only Admin and Member are allowed. The Clerk client here is a recording
 * stand-in: nothing reaches Clerk and no invitation email is sent.
 */

const ORG = "org_members_actions";
const session = vi.hoisted(() => ({ userId: "user_members_admin", orgId: "org_members_actions", orgRole: "org:admin" }));
const clerk = vi.hoisted(() => ({
  members: new Map<string, string>(),
  invitations: new Map<string, { organizationId: string; status: string }>(),
  calls: [] as { method: string; params: Record<string, unknown> }[],
  failNext: null as null | { status: number; code: string },
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@clerk/nextjs/server", () => {
  const record = (method: string) => async (params: Record<string, unknown>) => {
    clerk.calls.push({ method, params });
    if (clerk.failNext) {
      const { status, code } = clerk.failNext;
      clerk.failNext = null;
      throw Object.assign(new Error(code), { clerkError: true, status, errors: [{ code, message: code }] });
    }
    return { id: "orginv_new", ...params };
  };
  return {
    auth: async () => ({ ...session }),
    clerkClient: async () => ({
      organizations: {
        getOrganizationMembershipList: async ({ organizationId, userId }: { organizationId: string; userId?: string[] }) => {
          const data = [...clerk.members]
            .filter(([id]) => organizationId === ORG && (!userId || userId.includes(id)))
            .map(([id, role]) => ({ organization: { id: ORG }, role, publicUserData: { userId: id, identifier: `${id}@example.test` } }));
          return { totalCount: data.length, data };
        },
        getOrganizationInvitation: async ({ organizationId, invitationId }: { organizationId: string; invitationId: string }) => {
          const invitation = clerk.invitations.get(invitationId);
          if (!invitation || invitation.organizationId !== organizationId) throw Object.assign(new Error("not found"), { clerkError: true, status: 404, errors: [{ code: "resource_not_found" }] });
          return { id: invitationId, ...invitation };
        },
        createOrganizationInvitation: record("invite"),
        updateOrganizationMembership: record("changeRole"),
        revokeOrganizationInvitation: record("revoke"),
      },
    }),
  };
});

const api = () => import("./actions");
const ctx = { orgId: ORG };
const as = (userId: string, orgRole: string) => Object.assign(session, { userId, orgId: ORG, orgRole });

beforeEach(() => {
  as("user_members_admin", "org:admin");
  clerk.members = new Map([["user_members_admin", "org:admin"], ["user_members_member", "org:member"], ["user_members_viewer", "org:viewer"]]);
  clerk.invitations = new Map([["orginv_here", { organizationId: ORG, status: "pending" }], ["orginv_elsewhere", { organizationId: "org_else", status: "pending" }]]);
  clerk.calls = [];
  clerk.failNext = null;
});
afterEach(() => vi.unstubAllEnvs());

describe("inviting someone", () => {
  it("asks Clerk to invite them to this workspace, as the role the Admin chose, from the Admin", async () => {
    expect(await (await api()).inviteToWorkspace({ email: "  New.Person@Example.test ", role: "member" }, ctx)).toEqual({ success: true });
    expect(clerk.calls).toEqual([{ method: "invite", params: { organizationId: ORG, emailAddress: "new.person@example.test", role: "org:member", inviterUserId: "user_members_admin" } }]);
  });

  it("offers Guest and Viewer only while the custom roles switch is on", async () => {
    const { inviteToWorkspace } = await api();
    for (const role of ["viewer", "guest"]) {
      expect(await inviteToWorkspace({ email: "leader@example.test", role }, ctx)).toEqual({ error: "Guest and Viewer aren't available in this workspace yet. Invite them as a Member, or ask whoever runs Lane to turn these roles on." });
    }
    expect(clerk.calls).toEqual([]);
    vi.stubEnv("LANE_CUSTOM_ROLES", "1");
    expect(await inviteToWorkspace({ email: "leader@example.test", role: "viewer" }, ctx)).toEqual({ success: true });
    expect(clerk.calls[0].params).toMatchObject({ role: "org:viewer" });
  });

  it("refuses a Member, a bad address and an unknown role, and sends nothing", async () => {
    const { inviteToWorkspace } = await api();
    expect(await inviteToWorkspace({ email: "not-an-address", role: "member" }, ctx)).toEqual({ error: "Enter an email address." });
    expect(await inviteToWorkspace({ email: "x@example.test", role: "owner" }, ctx)).toEqual({ error: "Choose Admin, Member, Guest or Viewer." });
    as("user_members_member", "org:member");
    expect(await inviteToWorkspace({ email: "x@example.test", role: "member" }, ctx)).toEqual({ error: "Only Admins can invite people to this workspace." });
    expect(clerk.calls).toEqual([]);
  });

  it("says plainly when Clerk won't send it", async () => {
    const { inviteToWorkspace } = await api();
    clerk.failNext = { status: 400, code: "duplicate_record" };
    expect(await inviteToWorkspace({ email: "dup@example.test", role: "member" }, ctx)).toEqual({ error: "dup@example.test already has an invitation or is already in this workspace." });
    clerk.failNext = { status: 500, code: "internal_clerk_error" };
    expect(await inviteToWorkspace({ email: "x@example.test", role: "member" }, ctx)).toEqual({ error: "The invitation couldn't be sent. Try again." });
  });
});

describe("changing someone's role", () => {
  it("asks Clerk to change a person in this workspace", async () => {
    expect(await (await api()).changeMemberRole({ userId: "user_members_member", role: "admin" }, ctx)).toEqual({ success: true });
    expect(clerk.calls).toEqual([{ method: "changeRole", params: { organizationId: ORG, userId: "user_members_member", role: "org:admin" } }]);
  });

  it("makes someone a Viewer or Guest only while the switch is on, and always lets an Admin move them back to a paid seat", async () => {
    const { changeMemberRole } = await api();
    expect(await changeMemberRole({ userId: "user_members_member", role: "viewer" }, ctx)).toHaveProperty("error");
    expect(await changeMemberRole({ userId: "user_members_viewer", role: "member" }, ctx)).toEqual({ success: true });
    vi.stubEnv("LANE_CUSTOM_ROLES", "1");
    expect(await changeMemberRole({ userId: "user_members_member", role: "viewer" }, ctx)).toEqual({ success: true });
    expect(clerk.calls.map((c) => c.params.role)).toEqual(["org:member", "org:viewer"]);
  });

  it("refuses an Admin's own role, someone outside the workspace, and a Member", async () => {
    const { changeMemberRole } = await api();
    expect(await changeMemberRole({ userId: "user_members_admin", role: "member" }, ctx)).toEqual({ error: "You can't change your own role. Ask another Admin to do it." });
    expect(await changeMemberRole({ userId: "user_elsewhere", role: "member" }, ctx)).toEqual({ error: "That person isn't in this workspace any more. Reload to see who is." });
    as("user_members_member", "org:member");
    expect(await changeMemberRole({ userId: "user_members_viewer", role: "member" }, ctx)).toEqual({ error: "Only Admins can change people's roles." });
    expect(clerk.calls).toEqual([]);
  });
});

describe("revoking an invitation", () => {
  it("revokes a pending invitation to this workspace only", async () => {
    const { revokeInvitation } = await api();
    expect(await revokeInvitation({ invitationId: "orginv_elsewhere" }, ctx)).toEqual({ error: "That invitation isn't pending any more. Reload to see the latest." });
    expect(await revokeInvitation({ invitationId: "orginv_here" }, ctx)).toEqual({ success: true });
    expect(clerk.calls).toEqual([{ method: "revoke", params: { organizationId: ORG, invitationId: "orginv_here", requestingUserId: "user_members_admin" } }]);
  });
});
