/**
 * #210, #396 (spec #383 "Settings", Members; stories 57–65): Admins invite people as, and change people to, Admin,
 * Member, Guest or Viewer, in every workspace (#393), cancel invitations and remove people. The actions run as the
 * person whose browser calls them, through Lane's server door and the session seam, on a local lane_test database.
 * Only outbound HTTP and the payment provider are faked.
 */
import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { guardOwnerOrAdmin } from "@/lib/auth-guard";
import { AUTH_ERROR_COPY } from "@/lib/auth-error-copy";
import { loadMembers } from "@/lib/data/members";
import { recordingPaymentProvider, type PaymentProvider, type SeatChange } from "@/lib/payment-provider";
import { readSession } from "@/lib/session";
import { AuthBrowser, authRouteTestFile, fakeOutbound, switchOnAuthRoute, type Outbound } from "@/test/auth-route-browser";
import { changeMemberRole, inviteToWorkspace, removeMember, revokeInvitation } from "./actions";

const stand = vi.hoisted(() => ({ provider: null as null | (PaymentProvider & { seatChanges: SeatChange[] }) }));
vi.mock("@/lib/payment-provider", async (original) => ({ ...(await original<typeof import("@/lib/payment-provider")>()), paymentProvider: () => stand.provider }));

vi.mock("next/cache", async (original) => ({ ...(await original<typeof import("next/cache")>()), revalidatePath: vi.fn() }));

const { connection, domain, person, signedIn, createWorkspace, join } = authRouteTestFile("members-actions.test");

const ROLES = ["admin", "member", "guest", "viewer"];
const VIEWER_REFUSED = "You’re a Viewer in this workspace, so you can read everything but can’t change anything. Ask an Admin if you need to.";
/** Non-Admin roles, and what each is told by an action whose own refusal is `line`. */
const refusedAs = (line: string): [role: string, refusal: string][] => [["member", line], ["guest", line], ["viewer", VIEWER_REFUSED]];

let outbound: Outbound;
beforeEach(() => {
  switchOnAuthRoute();
  outbound = fakeOutbound();
});

/** A signed-in Admin with a new workspace. */
async function adminWithWorkspace(label = "admin") {
  const admin = await signedIn(outbound, label);
  const orgId = await createWorkspace(admin.browser);
  outbound.calls.length = 0;
  return { ...admin, orgId, ctx: { orgId } };
}
type Admin = Awaited<ReturnType<typeof adminWithWorkspace>>;
type Caller = Pick<Admin, "browser" | "ctx">;

/** Someone in the workspace who never acts: their rows only. */
async function seated(orgId: string, role: string) {
  const userId = `user_${randomUUID()}`;
  await connection`insert into profiles (id, full_name, email) values (${userId}, ${`Seated ${role}`}, ${`${userId}@${domain}`})`;
  await connection`insert into member (id, organization_id, user_id, role, created_at) values (${randomUUID()}, ${orgId}, ${userId}, ${role}, now())`;
  return userId;
}
const newAddress = () => person("invitee").email;
const roleOf = async (orgId: string, userId: string) => (await connection`select role from member where organization_id = ${orgId} and user_id = ${userId}`)[0]?.role ?? null;
const invitations = async (orgId: string) => (await connection`select email, role, status from invitation where organization_id = ${orgId} order by created_at`).map((row) => ({ ...row }));
const invitationTo = async (email: string) => (await connection`select id from invitation where email = ${email}`)[0].id as string;

/** A Request this person filed and a comment they wrote on it; answers how many of each are left. */
async function requestAndComment(orgId: string, userId: string) {
  const [{ id }] = await connection`insert into requests (org_id, title, description, created_by) values (${orgId}, 'Checkout fails', 'On mobile', ${userId}) returning id`;
  await connection`insert into comments (request_id, author_id, body) values (${id}, ${userId}, 'Seen again today')`;
  return async () => {
    const [left] = await connection`
      select (select count(*)::int from requests where id = ${id} and created_by = ${userId}) as requests,
             (select count(*)::int from comments where request_id = ${id} and author_id = ${userId}) as comments`;
    return { ...left };
  };
}

// Revalidating is what makes Next send the page, read again, in the action's answer.
describe("the lists after a change", () => {
  it("are read again after each change, a failed send included, and not after a refusal", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const admin = await adminWithWorkspace();
    const teammate = await seated(admin.orgId, "member");
    const email = newAddress();
    const readAgain = async (act: () => Promise<unknown>) => {
      vi.mocked(revalidatePath).mockClear();
      await admin.browser.action(act);
      return vi.mocked(revalidatePath).mock.calls.length > 0;
    };
    const invite = () => inviteToWorkspace({ email, role: "guest" }, admin.ctx);
    outbound.resend = () => Response.json({ name: "application_error" }, { status: 500 });
    expect(await readAgain(invite)).toBe(true);
    expect(await readAgain(invite)).toBe(false);
    const invitationId = await invitationTo(email);
    expect(await readAgain(() => revokeInvitation({ invitationId }, admin.ctx))).toBe(true);
    outbound.resend = () => Response.json({ id: "email_sent" });
    expect(await readAgain(invite)).toBe(true);
    expect(await readAgain(() => changeMemberRole({ userId: teammate, role: "viewer" }, admin.ctx))).toBe(true);
    expect(await readAgain(() => removeMember({ userId: admin.userId }, admin.ctx))).toBe(false);
    expect(await readAgain(() => removeMember({ userId: teammate }, admin.ctx))).toBe(true);
  });
});

describe("inviting someone", () => {
  const invite = (admin: Caller, email: string, role: string) => admin.browser.action(() => inviteToWorkspace({ email, role }, admin.ctx));

  it.each(ROLES)("as %s makes one pending invitation to this workspace and sends one email", async (role) => {
    const admin = await adminWithWorkspace();
    const email = newAddress();
    expect(await invite(admin, `  ${email.toUpperCase()} `, role)).toEqual({ success: true });
    expect(await invitations(admin.orgId)).toEqual([{ email, role, status: "pending" }]);
    expect(outbound.emails().map((sent) => sent.to)).toEqual([[email]]);
  });

  it("refuses a role that isn't one of the four, and a bad address, and sends nothing", async () => {
    const admin = await adminWithWorkspace();
    for (const role of ["owner", "org:guest", "Guest", "admin,member", ""])
      expect(await invite(admin, newAddress(), role)).toEqual({ error: "Choose Admin, Member, Guest or Viewer." });
    // #288 (D27): the same two messages the invite field shows.
    expect(await invite(admin, "  ", "member")).toEqual({ error: "Enter an email address.", field: "email" });
    expect(await invite(admin, "not-an-address", "member")).toEqual({ error: "Enter a valid email address.", field: "email" });
    expect(await invitations(admin.orgId)).toEqual([]);
    expect(outbound.emails()).toEqual([]);
  });

  it.each(refusedAs("Only Admins can invite people to this workspace."))("refuses a %s inviting anyone as any role, and sends nothing", async (role, refusal) => {
    const admin = await adminWithWorkspace();
    const { browser } = await join(outbound, admin.browser, role);
    outbound.calls.length = 0;
    for (const asked of ROLES) expect(await invite({ browser, ctx: admin.ctx }, newAddress(), asked)).toEqual({ error: refusal });
    expect((await loadMembers(admin.ctx, "admin")).invitations).toEqual([]);
    expect(outbound.emails()).toEqual([]);
  });

  it("refuses an Admin of another workspace, and nobody signed in", async () => {
    const admin = await adminWithWorkspace();
    const other = await adminWithWorkspace("other");
    expect(await invite({ browser: other.browser, ctx: admin.ctx }, newAddress(), "member")).toEqual({ error: "Only Admins can invite people to this workspace." });
    expect(await invite({ browser: new AuthBrowser(), ctx: admin.ctx }, newAddress(), "member")).toMatchObject({ sessionExpired: true });
    expect(await invitations(admin.orgId)).toEqual([]);
  });

  it("says on the field when the address is already invited or already here", async () => {
    const admin = await adminWithWorkspace();
    const email = newAddress();
    await invite(admin, email, "guest");
    const line = (address: string) => ({ error: `${address} already has an invitation or is already in this workspace.`, field: "email" });
    expect(await invite(admin, email.toUpperCase(), "member")).toEqual(line(email));
    const memberEmail = `${await seated(admin.orgId, "member")}@${domain}`;
    expect(await invite(admin, memberEmail, "member")).toEqual(line(memberEmail));
    expect(await invitations(admin.orgId)).toEqual([{ email, role: "guest", status: "pending" }]);
    expect(outbound.emails()).toHaveLength(1);
  });

  it("sends a new invitation to an address whose last one expired", async () => {
    const admin = await adminWithWorkspace();
    const email = newAddress();
    await invite(admin, email, "guest");
    await connection`update invitation set expires_at = now() - interval '1 minute' where email = ${email}`;
    expect(await invite(admin, email, "member")).toEqual({ success: true });
    expect(outbound.emailsTo(email)).toHaveLength(2);
  });

  it("refuses when 100 invitations are waiting", async () => {
    const admin = await adminWithWorkspace();
    await connection`
      insert into invitation (id, organization_id, email, role, status, expires_at, inviter_id)
      select gen_random_uuid()::text, ${admin.orgId}, 'waiting-' || n || '@' || ${domain}, 'guest', 'pending', now() + interval '7 days', ${admin.userId} from generate_series(1, 100) n`;
    expect(await invite(admin, newAddress(), "member")).toEqual({ error: "This workspace already has 100 invitations waiting. Cancel some on the Members page in Settings, then invite again." });
  });

  // Better Auth would send the invitation, and refuse the person as they accept it.
  it("refuses inviting anyone into a workspace of 100 people", async () => {
    const admin = await adminWithWorkspace();
    const others = await connection`
      insert into profiles (id, full_name, email)
      select gen_random_uuid()::text, 'Filler ' || n, 'filler-' || n || '-' || ${admin.orgId} || '@' || ${domain} from generate_series(1, 98) n returning id`;
    await connection`insert into member ${connection(others.map(({ id }) => ({ id: randomUUID(), organization_id: admin.orgId, user_id: id, role: "viewer", created_at: new Date() })))}`;
    expect(await invite(admin, newAddress(), "member")).toEqual({ success: true });
    await seated(admin.orgId, "guest");
    // Proposed for Nikhil (#396).
    expect(await invite(admin, newAddress(), "member")).toEqual({ error: "This workspace already has 100 people, Lane’s limit. Remove someone, then invite again." });
    expect(await invitations(admin.orgId)).toHaveLength(1);
    expect(outbound.emails()).toHaveLength(1);
  });

  it("says when the invitation couldn't be sent, and how to send it again, which then works", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const admin = await adminWithWorkspace();
    const email = newAddress();
    outbound.resend = () => Response.json({ name: "application_error" }, { status: 500 });
    // The first sentence is the spec's; the second is proposed for Nikhil (#396).
    expect(await invite(admin, email, "member")).toEqual({ error: "The invitation couldn’t be sent. Revoke it on the Members page in Settings, then invite them again." });
    const listed = (await loadMembers(admin.ctx, "admin")).invitations;
    expect(listed.map((invitation) => invitation.email)).toEqual([email]);

    outbound.resend = () => Response.json({ id: "email_sent" });
    expect(await admin.browser.action(() => revokeInvitation({ invitationId: listed[0].id }, admin.ctx))).toEqual({ success: true });
    expect(await invite(admin, email, "member")).toEqual({ success: true });
  });
});

describe("changing someone's role", () => {
  const change = (admin: Caller, userId: string, role: string) => admin.browser.action(() => changeMemberRole({ userId, role }, admin.ctx));

  it("applies on that person's next read, for each of the four roles, and keeps their Requests and comments", async () => {
    const admin = await adminWithWorkspace();
    const teammate = await join(outbound, admin.browser, "member");
    const history = await requestAndComment(admin.orgId, teammate.userId);
    for (const role of ["viewer", "guest", "admin", "member"]) {
      expect(await change(admin, teammate.userId, role)).toEqual({ success: true });
      expect(await teammate.browser.action(() => readSession())).toEqual({ userId: teammate.userId, orgId: admin.orgId, role });
    }
    expect(await history()).toEqual({ requests: 1, comments: 1 });
  });

  it("refuses a role that isn't one of the four, and changes nothing", async () => {
    const admin = await adminWithWorkspace();
    const userId = await seated(admin.orgId, "member");
    for (const role of ["owner", "org:viewer", "Viewer", "admin,member", ""]) expect(await change(admin, userId, role)).toEqual({ error: "Choose Admin, Member, Guest or Viewer." });
    expect(await roleOf(admin.orgId, userId)).toBe("member");
  });

  it.each(refusedAs("Only Admins can change people’s roles."))("refuses a %s changing anyone to any role", async (role, refusal) => {
    const admin = await adminWithWorkspace();
    const { browser } = await join(outbound, admin.browser, role);
    const target = await seated(admin.orgId, "viewer");
    for (const asked of ROLES) expect(await change({ browser, ctx: admin.ctx }, target, asked)).toEqual({ error: refusal });
    expect(await roleOf(admin.orgId, target)).toBe("viewer");
  });

  it("refuses an Admin's own role, though the workspace has another Admin, and someone in another workspace", async () => {
    const admin = await adminWithWorkspace();
    await seated(admin.orgId, "admin");
    const other = await adminWithWorkspace("other");
    const elsewhere = await seated(other.orgId, "member");
    const gone = { error: "That person isn’t in this workspace any more. Reload to see who is." };
    expect(await change(admin, admin.userId, "member")).toEqual({ error: "You can’t change your own role. Ask another Admin to do it." });
    expect(await change(admin, elsewhere, "admin")).toEqual(gone);
    expect(await change(admin, "user_nobody", "admin")).toEqual(gone);
    // Naming the other workspace doesn't reach it either.
    expect(await change({ browser: admin.browser, ctx: other.ctx }, elsewhere, "admin")).toEqual({ error: "Only Admins can change people’s roles." });
    expect([await roleOf(admin.orgId, admin.userId), await roleOf(other.orgId, elsewhere)]).toEqual(["admin", "member"]);
  });

  it("gives a Lane role to someone holding a role Lane doesn't know", async () => {
    const admin = await adminWithWorkspace();
    const userId = await seated(admin.orgId, "owner");
    expect(await change(admin, userId, "viewer")).toEqual({ success: true });
    expect(await roleOf(admin.orgId, userId)).toBe("viewer");
  });
});

describe("cancelling an invitation", () => {
  const cancel = (admin: Caller, invitationId: string) => admin.browser.action(() => revokeInvitation({ invitationId }, admin.ctx));
  const gone = { error: "That invitation isn’t pending any more. Reload to see the latest." };

  it("leaves a link that can't be accepted, and an invitation that isn't pending any more", async () => {
    const admin = await adminWithWorkspace();
    const invitee = await signedIn(outbound, "invitee");
    await admin.browser.action(() => inviteToWorkspace({ email: invitee.person.email, role: "member" }, admin.ctx));
    const invitationId = await invitationTo(invitee.person.email);
    expect(await cancel(admin, invitationId)).toEqual({ success: true });
    expect((await loadMembers(admin.ctx, "admin")).invitations).toEqual([]);

    const accepted = await invitee.browser.post("/organization/accept-invitation", { invitationId });
    expect([accepted.status, accepted.body]).toEqual([400, expect.objectContaining({ code: "INVITATION_NOT_FOUND" })]);
    expect(await roleOf(admin.orgId, invitee.userId)).toBeNull();
    expect(await cancel(admin, invitationId)).toEqual(gone);
  });

  it("refuses another workspace's invitation, even from someone who is an Admin there too", async () => {
    const admin = await adminWithWorkspace();
    const email = newAddress();
    await admin.browser.action(() => inviteToWorkspace({ email, role: "member" }, admin.ctx));
    const second = await createWorkspace(admin.browser);
    expect(await cancel({ browser: admin.browser, ctx: { orgId: second } }, await invitationTo(email))).toEqual(gone);
    expect(await invitations(admin.orgId)).toEqual([{ email, role: "member", status: "pending" }]);
  });

  it.each(refusedAs("Only Admins can revoke invitations."))("refuses a %s", async (role, refusal) => {
    const admin = await adminWithWorkspace();
    const { browser } = await join(outbound, admin.browser, role);
    const email = newAddress();
    await admin.browser.action(() => inviteToWorkspace({ email, role: "guest" }, admin.ctx));
    expect(await cancel({ browser, ctx: admin.ctx }, await invitationTo(email))).toEqual({ error: refusal });
    expect(await invitations(admin.orgId)).toContainEqual({ email, role: "guest", status: "pending" });
  });
});

describe("removing someone", () => {
  const remove = (admin: Caller, userId: string) => admin.browser.action(() => removeMember({ userId }, admin.ctx));
  const NOT_ALLOWED = { ok: false, code: "YOU_ARE_NOT_ALLOWED_TO_DELETE_THIS_MEMBER" };
  const NOT_HERE = { ok: false, code: "MEMBER_NOT_FOUND" };

  it.each(ROLES)("takes a person who is %s out on their next read, and keeps their Requests, comments and profile", async (role) => {
    const admin = await adminWithWorkspace();
    const teammate = await join(outbound, admin.browser, role);
    const history = await requestAndComment(admin.orgId, teammate.userId);
    expect(await remove(admin, teammate.userId)).toEqual({ ok: true });

    expect(await teammate.browser.action(() => readSession())).toEqual({ userId: teammate.userId, orgId: null, role: null });
    expect(await teammate.browser.action(() => guardOwnerOrAdmin(admin.orgId, "no"))).toEqual({ error: "no" });
    expect(await history()).toEqual({ requests: 1, comments: 1 });
    expect(await connection`select id from profiles where id = ${teammate.userId}`).toHaveLength(1);
    expect((await loadMembers(admin.ctx, "admin")).people.map((each) => each.userId)).toEqual([admin.userId]);
    expect(await remove(admin, teammate.userId)).toEqual(NOT_HERE);
  });

  it("refuses removing yourself, though the workspace has another Admin", async () => {
    const admin = await adminWithWorkspace();
    await seated(admin.orgId, "admin");
    expect(await remove(admin, admin.userId)).toEqual({ ok: false, code: "CANNOT_REMOVE_YOURSELF" });
    expect(await roleOf(admin.orgId, admin.userId)).toBe("admin");
    // Proposed for Nikhil (#396).
    expect(AUTH_ERROR_COPY.CANNOT_REMOVE_YOURSELF).toBe("You can’t remove yourself. Leave the workspace in Settings instead.");
  });

  it.each(["member", "guest", "viewer"])("refuses a %s removing anyone", async (role) => {
    const admin = await adminWithWorkspace();
    const { browser } = await join(outbound, admin.browser, role);
    const target = await seated(admin.orgId, "viewer");
    for (const userId of [target, admin.userId]) expect(await remove({ browser, ctx: admin.ctx }, userId)).toEqual(NOT_ALLOWED);
    expect([await roleOf(admin.orgId, target), await roleOf(admin.orgId, admin.userId)]).toEqual(["viewer", "admin"]);
  });

  it("refuses removing someone from another workspace, and nobody signed in", async () => {
    const admin = await adminWithWorkspace();
    const other = await adminWithWorkspace("other");
    const elsewhere = await seated(other.orgId, "member");
    expect(await remove(admin, elsewhere)).toEqual(NOT_HERE);
    expect(await remove(admin, "")).toEqual(NOT_HERE);
    expect(await remove({ browser: admin.browser, ctx: other.ctx }, elsewhere)).toEqual(NOT_ALLOWED);
    expect(await remove({ browser: new AuthBrowser(), ctx: other.ctx }, elsewhere)).toEqual({ ok: false, code: "UNAUTHORIZED" });
    expect(await roleOf(other.orgId, elsewhere)).toBe("member");
  });

  it("takes someone out of this workspace only", async () => {
    const admin = await adminWithWorkspace();
    const teammate = await join(outbound, admin.browser, "member");
    const own = await createWorkspace(teammate.browser);
    expect(await remove(admin, teammate.userId)).toEqual({ ok: true });
    expect([await roleOf(admin.orgId, teammate.userId), await roleOf(own, teammate.userId)]).toEqual([null, "admin"]);
  });
});

/**
 * #215: Admins and Members are paid seats. While billing is enforced, adding one (inviting someone as a Member or
 * Admin, or making a Guest or Viewer one) needs the Admin's "This adds a paid seat" confirmation, and the server
 * refuses it without. A paying workspace's billed seats then follow the change (the payment provider is the
 * recording stand-in).
 */
describe("paid seats", () => {
  const enforce = () => vi.stubEnv("LANE_BILLING_ENFORCED", "1");
  const confirm = { error: "Confirm that this adds a paid seat." };
  beforeEach(() => { stand.provider = recordingPaymentProvider(); });

  it("asks for the confirmation before inviting a Member or an Admin, and sends nothing without it", async () => {
    const admin = await adminWithWorkspace();
    enforce();
    const invite = (role: string, confirmedPaidSeat?: boolean) => admin.browser.action(() => inviteToWorkspace({ email: newAddress(), role, confirmedPaidSeat }, admin.ctx));
    for (const role of ["member", "admin"]) expect(await invite(role)).toEqual(confirm);
    expect(await invitations(admin.orgId)).toEqual([]);
    expect(await invite("member", true)).toEqual({ success: true });
    expect(await invitations(admin.orgId)).toHaveLength(1);
  });

  it("needs no confirmation to invite a Guest or Viewer, or while billing isn't enforced", async () => {
    const admin = await adminWithWorkspace();
    const invite = (role: string) => admin.browser.action(() => inviteToWorkspace({ email: newAddress(), role }, admin.ctx));
    expect(await invite("member")).toEqual({ success: true });
    enforce();
    for (const role of ["guest", "viewer"]) expect(await invite(role)).toEqual({ success: true });
    expect(await invitations(admin.orgId)).toHaveLength(3);
  });

  it("asks for the confirmation before making a Guest or Viewer a Member or Admin, but not between paid seats", async () => {
    const admin = await adminWithWorkspace();
    const viewer = await seated(admin.orgId, "viewer");
    const teammate = await seated(admin.orgId, "member");
    enforce();
    const change = (userId: string, role: string, confirmedPaidSeat?: boolean) => admin.browser.action(() => changeMemberRole({ userId, role, confirmedPaidSeat }, admin.ctx));
    expect(await change(viewer, "member")).toEqual(confirm);
    expect(await roleOf(admin.orgId, viewer)).toBe("viewer");
    expect(await change(teammate, "admin")).toEqual({ success: true });
    expect(await change(viewer, "member", true)).toEqual({ success: true });
    expect(await roleOf(admin.orgId, viewer)).toBe("member");
  });

  it("charges a paying workspace part-month for the seat a promotion adds, and lowers the next bill for one made a Viewer or removed", async () => {
    const admin = await adminWithWorkspace();
    await connection`insert into workspace_billing (org_id, plan_state, provider_subscription_id, billed_seats) values (${admin.orgId}, 'paying', 'sub_members_paying', 3)`;
    const viewer = await seated(admin.orgId, "viewer");
    const demoted = await seated(admin.orgId, "member");
    const removed = await seated(admin.orgId, "member");
    const promoted = await seated(admin.orgId, "viewer");
    enforce();
    const change = (userId: string, role: string) => admin.browser.action(() => changeMemberRole({ userId, role, confirmedPaidSeat: true }, admin.ctx));
    const remove = (userId: string) => admin.browser.action(() => removeMember({ userId }, admin.ctx));
    const seats = () => stand.provider!.seatChanges;

    expect(await change(viewer, "member")).toEqual({ success: true });
    expect(seats()).toEqual([expect.objectContaining({ subscriptionId: "sub_members_paying", seats: 4, charge: "part_month_now" })]);
    expect(await change(demoted, "viewer")).toEqual({ success: true });
    expect(seats().at(-1)).toMatchObject({ seats: 3, charge: "next_bill" });

    expect(await change(promoted, "member")).toEqual({ success: true });
    expect(seats().at(-1)).toMatchObject({ seats: 4, charge: "part_month_now" });
    expect(await remove(removed)).toEqual({ ok: true });
    expect(seats().at(-1)).toMatchObject({ seats: 3, charge: "next_bill" });
    expect(seats()).toHaveLength(4);
    // A Viewer is no seat.
    expect(await remove(demoted)).toEqual({ ok: true });
    expect(seats()).toHaveLength(4);
  });
});
