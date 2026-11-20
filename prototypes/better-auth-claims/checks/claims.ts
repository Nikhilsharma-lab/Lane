// PROTOTYPE (#344). Pushes Better Auth 1.7.26 through the claims in the ticket,
// against local Postgres behind PgBouncer (transaction mode, prepare: false).
// Run: pnpm db:reset && npx tsx checks/claims.ts
import { createHmac } from "node:crypto";
import { auth, outbox } from "../lib/auth";
import { db, queries, sql } from "../lib/db";
import { Browser, expect, report, section, short, type Res } from "./client";

let ipSeq = 20;
const newBrowser = (name: string) => new Browser(name, `203.0.113.${ipSeq++}`);
const PASSWORD = "violet-otter-344-lane";
const lastCode = (email: string, kind: string) => [...outbox.mail].reverse().find((m) => m.to === email && m.kind === kind)?.code;
const lastInvite = (email: string) => [...outbox.mail].reverse().find((m) => m.to === email && m.kind === "invitation")?.url?.split("/").pop();
const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
const p95 = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length * 0.95)];

async function signUpVerified(name: string, email: string) {
  const b = newBrowser(name);
  const up = await b.call("/sign-up/email", { email, password: PASSWORD, name });
  if (up.status !== 200) throw new Error(`sign-up ${email}: ${short(up)}`);
  const v = await b.call("/email-otp/verify-email", { email, otp: lastCode(email, "email-verification") });
  if (v.status !== 200) throw new Error(`verify ${email}: ${short(v)}`);
  const s = await b.call("/sign-in/email", { email, password: PASSWORD });
  if (s.status !== 200) throw new Error(`sign-in ${email}: ${short(s)}`);
  return b;
}

// ---------------------------------------------------------------------------
section("Drizzle adapter on drizzle-orm 0.45.2 through a transaction-mode pooler");
{
  const b = newBrowser("adapter");
  const up = await b.call("/sign-up/email", { email: "adapter@example.test", password: PASSWORD, name: "Adapter" });
  expect(up.status === 200, "Sign-up writes profiles (Lane's table name and full_name column) through the adapter", short(up));
  const [row] = await sql`select full_name, role, email_verified from profiles where email = 'adapter@example.test'`;
  expect(row?.full_name === "Adapter" && row?.role === "designer", "Better Auth's name maps to profiles.full_name; Lane's profile label keeps its default", JSON.stringify(row));
  const forged = await newBrowser("forge").call("/sign-up/email", { email: "forge@example.test", password: PASSWORD, name: "F", role: "pm" });
  const [frow] = await sql`select role from profiles where email = 'forge@example.test'`;
  expect(forged.status !== 200 || frow?.role === "designer", "The browser can't set Lane's own profile columns at sign-up (input: false)", `${short(forged)} → role ${frow?.role}`);
  const [pgb] = await sql`show server_version`.catch(() => [{ server_version: "?" }]);
  report("INFO", "All queries in this run go to PgBouncer 1.x on :6544, pool_mode=transaction, max_prepared_statements=0", `server ${pgb?.server_version}`);
}

// ---------------------------------------------------------------------------
section("Email code: sign-in, verification and reset");
{
  const email = "codes@example.test";
  const b = newBrowser("codes");
  await b.call("/sign-up/email", { email, password: PASSWORD, name: "Codes" });
  const verifyCode = lastCode(email, "email-verification");
  expect(!!verifyCode && /^\d{6}$/.test(verifyCode), "Sign-up sends a 6-digit verification code (overrideDefaultEmailVerification)", `code ${verifyCode}`);
  const early = await b.call("/sign-in/email", { email, password: PASSWORD });
  expect(early.status === 403, "Password sign-in is refused until the email is verified", short(early));
  const bad = await b.call("/email-otp/verify-email", { email, otp: "000000" });
  expect(bad.status === 400, "A wrong verification code is refused", short(bad));
  const v = await b.call("/email-otp/verify-email", { email, otp: verifyCode });
  expect(v.status === 200 && v.body?.status === true, "The right code verifies the email", short(v));

  const send = await b.call("/email-otp/send-verification-otp", { email, type: "sign-in" });
  const code = lastCode(email, "sign-in");
  expect(send.status === 200 && !!code, "A sign-in code is sent to a known address", short(send));
  const si = await b.call("/sign-in/email-otp", { email, otp: code });
  expect(si.status === 200 && !!si.body?.token, "The sign-in code signs in and sets a session", short(si));
  const reuse = await newBrowser("reuse").call("/sign-in/email-otp", { email, otp: code });
  expect(reuse.status !== 200, "A used sign-in code can't be used again", short(reuse));

  // three wrong attempts burn the code
  const b2 = newBrowser("codes-attempts");
  await b2.call("/email-otp/send-verification-otp", { email, type: "sign-in" });
  const good = lastCode(email, "sign-in");
  // each attempt from a fresh IP, so the per-IP rate limit doesn't mask the attempt limit
  for (let i = 0; i < 3; i++) await newBrowser(`wrong-${i}`).call("/sign-in/email-otp", { email, otp: "111111" });
  const after = await newBrowser("right-after-wrong").call("/sign-in/email-otp", { email, otp: good });
  expect(after.status !== 200, "After 3 wrong attempts the correct code no longer works (allowedAttempts 3)", short(after));

  const before = outbox.mail.length;
  const unknown = await newBrowser("unknown").call("/email-otp/send-verification-otp", { email: "nobody@example.test", type: "sign-in" });
  report(unknown.status === 200 && outbox.mail.length === before ? "FINDING" : "REFUTED",
    "Unknown address (disableSignUp): nothing is sent, but the answer is the same 200 success as for a real account",
    `${short(unknown)}. Lane's planned "No Lane account uses this email. Sign up instead." (#333 Q16) needs Lane's own lookup before calling Better Auth.`);
  const [ghost] = await sql`select count(*)::int as n from profiles where email = 'nobody@example.test'`;
  expect(ghost.n === 0, "Codes never create accounts", `profiles rows for nobody@: ${ghost.n}`);

  const other = newBrowser("codes-other-device");
  await other.call("/sign-in/email", { email, password: PASSWORD });
  const rp = await b.call("/email-otp/request-password-reset", { email });
  const resetCode = lastCode(email, "forget-password");
  expect(rp.status === 200 && !!resetCode, "Password reset sends a code", short(rp));
  const weak = await b.call("/email-otp/reset-password", { email, otp: resetCode, password: "password1" });
  expect(weak.status !== 200, "Reset refuses a breached password (haveIBeenPwned)", short(weak));
  const rp2 = await b.call("/email-otp/request-password-reset", { email });
  const reset = await b.call("/email-otp/reset-password", { email, otp: lastCode(email, "forget-password"), password: "new-violet-otter-344" });
  expect(reset.status === 200, "Reset with the code sets a new password", `${short(rp2)} / ${short(reset)}`);
  const oldPw = await newBrowser("old-pw").call("/sign-in/email", { email, password: PASSWORD });
  const newPw = await newBrowser("new-pw").call("/sign-in/email", { email, password: "new-violet-otter-344" });
  expect(oldPw.status !== 200 && newPw.status === 200, "Old password stops working, new one works", `${oldPw.status} / ${newPw.status}`);
  const otherSession = await other.call("/get-session");
  report(otherSession.body ? "FINDING" : "INFO",
    otherSession.body ? "A password reset leaves the person's other signed-in devices signed in (revokeSessionsOnPasswordReset is off by default)"
                      : "A password reset signs out the person's other devices",
    "Decide whether Lane sets emailAndPassword.revokeSessionsOnPasswordReset: true (Clerk signs other sessions out on reset).");

  // Resend refusing a send
  outbox.failSends = true;
  const failed = await newBrowser("fail").call("/email-otp/send-verification-otp", { email, type: "sign-in" });
  outbox.failSends = false;
  report(failed.status === 200 ? "FINDING" : "CONFIRMED",
    failed.status === 200 ? "When the email provider refuses a send, Better Auth still answers 200 success (the error is only logged)"
                          : "A refused send reaches the browser as an error",
    `${short(failed)}. Lane's "We couldn't send the code right now…" (#333 Q7) can't come from this response as is.`);

  // Turnstile
  const noCaptcha = new Browser("no-captcha", "203.0.113.200", false);
  const nc = await noCaptcha.call("/email-otp/send-verification-otp", { email, type: "sign-in" });
  expect(nc.status === 400 || nc.status === 403, "Email-code sends without a Turnstile token are refused", short(nc));
  const nc2 = await noCaptcha.call("/sign-in/email", { email, password: "new-violet-otter-344" });
  expect(nc2.status === 400 || nc2.status === 403, "Password sign-in without a Turnstile token is refused", short(nc2));

  // Rate limit on code sends: database storage, keyed by IP + path
  const rl = newBrowser("rate");
  const statuses: number[] = [];
  for (let i = 0; i < 5; i++) statuses.push((await rl.call("/email-otp/send-verification-otp", { email, type: "sign-in" })).status);
  expect(statuses.includes(429), "Repeated code sends from one IP are rate-limited", `statuses ${statuses.join(",")}`);
  const [rlRows] = await sql`select count(*)::int as n from rate_limit`;
  expect(rlRows.n > 0, "Rate-limit counters live in Postgres (storage: \"database\")", `${rlRows.n} rows in rate_limit`);
  const fromOtherIps: number[] = [];
  for (let i = 0; i < 4; i++) fromOtherIps.push((await newBrowser(`rate-${i}`).call("/email-otp/send-verification-otp", { email, type: "sign-in" })).status);
  report(fromOtherIps.every((s) => s === 200) ? "FINDING" : "INFO",
    "The limit is per IP, not per email address: 4 more sends to the same address from 4 new IPs all went through",
    `statuses ${fromOtherIps.join(",")}. "About 3 per address per 10 minutes" (#333 Q6) needs a Lane-side per-address check.`);
}

// ---------------------------------------------------------------------------
section("Custom roles admin/member/guest/viewer, creatorRole admin, no owner");
const A = await signUpVerified("Ada Admin", "ada@example.test");
const B = await signUpVerified("Ben Member", "ben@example.test");
const C = await signUpVerified("Cy Guest", "cy@example.test");
const D = await signUpVerified("Di Viewer", "di@example.test");
let orgId = "";
const ids: Record<string, string> = {};
{
  const create = await A.call("/organization/create", { name: "Proto Studio", slug: "proto-studio" });
  orgId = create.body?.id;
  expect(create.status === 200 && !!orgId, "An organization is created in Lane's organizations table", short(create));
  const forged = await A.call("/organization/create", { name: "Forged", slug: "forged", plan: "pro", lastRequestNumber: 99 });
  const [forgedRow] = await sql`select plan, last_request_number from organizations where slug = 'forged'`;
  expect(forged.status !== 200 || (forgedRow?.plan === "free" && forgedRow?.last_request_number === 0), "The browser can't set plan or last_request_number", `${short(forged)} → ${JSON.stringify(forgedRow)}`);
  const [creator] = await sql`select role from member where organization_id = ${orgId}`;
  expect(creator?.role === "admin", "The creator's membership role is admin, not owner", JSON.stringify(creator));
  await A.call("/organization/set-active", { organizationId: orgId });

  for (const [who, b, email, role] of [["Ben", B, "ben@example.test", "member"], ["Cy", C, "cy@example.test", "guest"], ["Di", D, "di@example.test", "viewer"]] as const) {
    const inv = await A.call("/organization/invite-member", { email, role, organizationId: orgId });
    const acc = await b.call("/organization/accept-invitation", { invitationId: lastInvite(email) ?? inv.body?.id });
    expect(inv.status === 200 && acc.status === 200, `Invite and accept as ${role} (${who})`, `${short(inv).slice(0, 80)} / ${short(acc).slice(0, 80)}`);
    await b.call("/organization/set-active", { organizationId: orgId });
  }
  for (const [k, b] of [["A", A], ["B", B], ["C", C], ["D", D]] as const) ids[k] = (await b.call("/organization/get-active-member")).body?.id;

  const ownerInvite = await A.call("/organization/invite-member", { email: "eve@example.test", role: "owner", organizationId: orgId });
  expect(ownerInvite.status >= 400, "Inviting with the role 'owner' is refused when owner isn't a defined role", short(ownerInvite));
  if (ownerInvite.status === 200) {
    const E = await signUpVerified("Eve Invitee", "eve@example.test");
    const acc = await E.call("/organization/accept-invitation", { invitationId: ownerInvite.body?.id });
    await E.call("/organization/set-active", { organizationId: orgId });
    const eve = await E.call("/organization/get-active-member");
    report(eve.body?.role === "owner" ? "FINDING" : "INFO", `Accepting that invitation creates a member whose role is '${eve.body?.role}'`,
      `${short(acc).slice(0, 90)}. Lane must refuse any role outside admin/member/guest/viewer itself (hook or allow-list before invite and role change).`);
    const evePerm = await E.call("/organization/has-permission", { permissions: { member: ["delete"] }, organizationId: orgId });
    report("INFO", `That 'owner' member's has-permission(member:delete) = ${evePerm.body?.success}`, short(evePerm));
    const toOwner = await A.call("/organization/update-member-role", { memberId: ids.C, role: "owner", organizationId: orgId });
    report(toOwner.status === 200 ? "FINDING" : "CONFIRMED", toOwner.status === 200 ? "An Admin can also change someone's role to 'owner'" : "Changing a role to 'owner' is refused", short(toOwner));
    if (toOwner.status === 200) await A.call("/organization/update-member-role", { memberId: ids.C, role: "guest", organizationId: orgId });
    await A.call("/organization/remove-member", { memberIdOrEmail: eve.body?.id, organizationId: orgId });
  }
  if (ownerInvite.status !== 200) {
    const toOwner = await A.call("/organization/update-member-role", { memberId: ids.C, role: "owner", organizationId: orgId });
    expect(toOwner.status >= 400, "Changing someone's role to 'owner' is refused", short(toOwner));
  }
  const bogus = await A.call("/organization/invite-member", { email: "eve@example.test", role: "superuser", organizationId: orgId });
  expect(bogus.status >= 400, "Inviting with an undefined role is refused", short(bogus));

  const perm = async (b: Browser, p: Record<string, string[]>) => (await b.call("/organization/has-permission", { permissions: p, organizationId: orgId })).body?.success;
  expect(await perm(C, { request: ["create"] }) === true && await perm(C, { request: ["change"] }) === false, "Guest: may create and comment, may not change", "");
  expect(await perm(D, { request: ["comment"] }) === false, "Viewer: changes nothing", "");
  expect(await perm(B, { member: ["create"] }) === false && await perm(A, { member: ["create"] }) === true, "Only Admin manages members", "");

  const guestInvite = await C.call("/organization/invite-member", { email: "eve@example.test", role: "member", organizationId: orgId });
  expect(guestInvite.status >= 400, "A Guest can't invite", short(guestInvite));
  const memberRename = await B.call("/organization/update", { data: { name: "Hijacked" }, organizationId: orgId });
  expect(memberRename.status >= 400, "A Member can't rename the workspace", short(memberRename));
  const adminRename = await A.call("/organization/update", { data: { name: "Proto Studio 2" }, organizationId: orgId });
  expect(adminRename.status === 200, "An Admin renames the workspace", short(adminRename));
  const logo = await A.call("/organization/update", { data: { logo: "https://example.test/logo.png", metadata: { a: 1 } }, organizationId: orgId });
  const [logoRow] = await sql`select logo, metadata from organizations where id = ${orgId}`;
  report(logoRow?.logo ? "FINDING" : "CONFIRMED", logoRow?.logo ? "An Admin can still store a workspace logo and metadata through /organization/update" : "Logo and metadata can't be set",
    `${logo.status}; stored ${JSON.stringify(logoRow)}. Lane drops logos (#345 Q5): blank them in beforeUpdateOrganization / beforeCreateOrganization.`);
  const del = await A.call("/organization/delete", { organizationId: orgId });
  expect(del.status >= 400, "Workspace deletion is off (disableOrganizationDeletion)", short(del));

  const leaveAlone = await A.call("/organization/leave", { organizationId: orgId });
  expect(leaveAlone.status === 400, "The only Admin can't leave", `${short(leaveAlone)} (Better Auth's own copy says 'owner'; Lane shows its own sentence)`);
  const demoteSelf = await A.call("/organization/update-member-role", { memberId: ids.A, role: "member", organizationId: orgId });
  expect(demoteSelf.status === 400, "The only Admin can't demote themselves", short(demoteSelf));
  const promote = await A.call("/organization/update-member-role", { memberId: ids.B, role: "admin", organizationId: orgId });
  expect(promote.status === 200, "An Admin makes a Member an Admin", short(promote));
  const peerDemote = await B.call("/organization/update-member-role", { memberId: ids.A, role: "member", organizationId: orgId });
  expect(peerDemote.status === 200, "All Admins are equal: the newer Admin can demote the workspace's creator", short(peerDemote));
  const lastLeaves = await B.call("/organization/leave", { organizationId: orgId });
  expect(lastLeaves.status === 400, "Now Ben is the only Admin and can't leave either", short(lastLeaves));
  const removeSelf = await B.call("/organization/remove-member", { memberIdOrEmail: ids.B, organizationId: orgId });
  expect(removeSelf.status >= 400, "The only Admin can't remove themselves via remove-member", short(removeSelf));
  await B.call("/organization/update-member-role", { memberId: ids.A, role: "admin", organizationId: orgId });
  const memberDemotesAdmin = await C.call("/organization/update-member-role", { memberId: ids.A, role: "guest", organizationId: orgId });
  expect(memberDemotesAdmin.status >= 400, "A non-Admin can't change an Admin's role", short(memberDemotesAdmin));
  const adminRemovesAdmin = await A.call("/organization/remove-member", { memberIdOrEmail: ids.B, organizationId: orgId });
  expect(adminRemovesAdmin.status === 200, "With two Admins, one Admin removes the other", short(adminRemovesAdmin));
  const rejoin = await A.call("/organization/invite-member", { email: "ben@example.test", role: "member", organizationId: orgId });
  await B.call("/organization/accept-invitation", { invitationId: lastInvite("ben@example.test") ?? rejoin.body?.id });
  await B.call("/organization/set-active", { organizationId: orgId });
  ids.B = (await B.call("/organization/get-active-member")).body?.id;

  const twoMembersLeave = await D.call("/organization/leave", { organizationId: orgId });
  expect(twoMembersLeave.status === 200, "A non-Admin leaves freely", short(twoMembersLeave));
  const reinviteD = await A.call("/organization/invite-member", { email: "di@example.test", role: "viewer", organizationId: orgId });
  await D.call("/organization/accept-invitation", { invitationId: lastInvite("di@example.test") ?? reinviteD.body?.id });
  await D.call("/organization/set-active", { organizationId: orgId });

  // invitation rules
  const unverified = newBrowser("unverified");
  await unverified.call("/sign-up/email", { email: "una@example.test", password: PASSWORD, name: "Una" });
  const unInv = await A.call("/organization/invite-member", { email: "una@example.test", role: "member", organizationId: orgId });
  const unAcc = await unverified.call("/organization/accept-invitation", { invitationId: unInv.body?.id });
  report(unAcc.status >= 400 ? "CONFIRMED" : "REFUTED", "An unverified account can't accept (it can't even sign in to try)", short(unAcc));
  const wrong = await C.call("/organization/accept-invitation", { invitationId: unInv.body?.id });
  expect(wrong.status >= 400, "Someone whose email doesn't match can't accept another person's invitation", short(wrong));
  const resend = await A.call("/organization/invite-member", { email: "una@example.test", role: "member", organizationId: orgId, resend: true });
  const [{ n: pending }] = await sql`select count(*)::int as n from invitation where email = 'una@example.test' and status = 'pending'`;
  expect(resend.status === 200 && pending === 1, "Resending an invitation sends it again without a second pending row", `${short(resend).slice(0, 100)} pending=${pending}`);
  const [{ days }] = await sql`select round(extract(epoch from expires_at - created_at) / 86400)::int as days from invitation where email = 'una@example.test'`;
  expect(days === 7, "Invitations expire after 7 days", `${days} days`);
  const cancel = await A.call("/organization/cancel-invitation", { invitationId: unInv.body?.id });
  expect(cancel.status === 200, "An Admin cancels a pending invitation", short(cancel));
  const [{ owners }] = await sql`select count(*)::int as owners from member where role like '%owner%'`;
  report("INFO", `Member rows holding 'owner' after clean-up: ${owners}`);
}

// ---------------------------------------------------------------------------
section("Per-request cost of reading the session and the role");
{
  // Lane's guard as #333 Q5 describes it: one joined query for session + membership.
  // Better Auth signs the cookie as "<token>.<base64 HMAC-SHA256(secret, token)>".
  const SECRET = "prototype-344-not-a-secret-prototype-344-not-a-secret";
  const tokenFrom = (b: Browser) => {
    const raw = decodeURIComponent(b.cookies.get("better-auth.session_token") ?? "");
    const i = raw.lastIndexOf(".");
    const token = raw.slice(0, i), sig = raw.slice(i + 1);
    return createHmac("sha256", SECRET).update(token).digest("base64") === sig ? token : null;
  };
  async function laneGuard(b: Browser, org: string) {
    const token = tokenFrom(b);
    if (!token) return null;
    const [row] = await sql`
      select s.user_id, m.organization_id, m.role
      from session s join member m on m.user_id = s.user_id and m.organization_id = ${org}
      where s.token = ${token} and s.expires_at > now()`;
    return row ?? null;
  }
  expect((await laneGuard(B, orgId))?.role === "member", "A one-query guard (signed cookie → session ⋈ member) returns the role", "");
  const tampered = new Browser("tampered"); tampered.cookies.set("better-auth.session_token", encodeURIComponent(`${B.cookies.get("better-auth.session_token")}x`));
  expect((await laneGuard(tampered, orgId)) === null, "A tampered cookie fails the signature check before any query", "");

  const runs = 40;
  const t: Record<string, number[]> = { getSession: [], getSessionPlusMember: [], laneGuard: [] };
  const q: Record<string, number> = {};
  for (let i = 0; i < runs + 5; i++) {
    let q0 = queries.count, t0 = performance.now();
    await auth.api.getSession({ headers: B.headers() });
    if (i >= 5) { t.getSession.push(performance.now() - t0); q.getSession = queries.count - q0; }
    q0 = queries.count; t0 = performance.now();
    await auth.api.getActiveMember({ headers: B.headers() });
    if (i >= 5) { t.getSessionPlusMember.push(performance.now() - t0 + t.getSession.at(-1)!); q.getSessionPlusMember = queries.count - q0 + q.getSession; }
    t0 = performance.now();
    await laneGuard(B, orgId);
    if (i >= 5) t.laneGuard.push(performance.now() - t0);
  }
  q.laneGuard = 1;
  for (const k of Object.keys(t)) report("MEASURED", `${k}: median ${median(t[k]).toFixed(1)} ms, p95 ${p95(t[k]).toFixed(1)} ms, ${q[k]} queries`, k === "getSessionPlusMember" ? "getActiveMember re-reads the session itself" : "");

  // A session past updateAge (1 day) is refreshed on read: one extra write.
  await sql`update session set expires_at = now() + interval '5 days', updated_at = now() - interval '2 days' where user_id = (select id from profiles where email = 'ben@example.test')`;
  const q0 = queries.count, t0 = performance.now();
  const r = await B.call("/get-session");
  report("MEASURED", `A session older than a day is extended on the next read: ${(performance.now() - t0).toFixed(1)} ms, ${queries.count - q0} queries`, `status ${r.status}; Set-Cookie refreshed: ${B.cookies.has("better-auth.session_token")}`);
}

// ---------------------------------------------------------------------------
section("How quickly revocation takes effect (cookie cache off)");
{
  const before = await B.call("/organization/has-permission", { permissions: { request: ["change"] }, organizationId: orgId });
  const t0 = Date.now();
  await A.call("/organization/update-member-role", { memberId: ids.B, role: "viewer", organizationId: orgId });
  const after = await B.call("/organization/has-permission", { permissions: { request: ["change"] }, organizationId: orgId });
  expect(before.body?.success === true && after.body?.success === false, `Member → Viewer applies on Ben's very next request (${Date.now() - t0} ms after the change)`, `${short(before)} → ${short(after)}`);

  await A.call("/organization/remove-member", { memberIdOrEmail: ids.B, organizationId: orgId });
  const member = await B.call("/organization/get-active-member");
  const sess = await B.call("/get-session");
  expect(member.status >= 400 || !member.body, "After removal, Ben's next membership read fails", short(member));
  report(sess.body?.session?.activeOrganizationId === orgId ? "FINDING" : "INFO",
    "After removal Ben's session still names the workspace as active (activeOrganizationId isn't cleared)",
    `activeOrganizationId=${sess.body?.session?.activeOrganizationId}. Harmless only because Lane's guard reads the member row every request (#333 Q5); never trust activeOrganizationId alone.`);

  const D2 = newBrowser("di-second-device");
  await D2.call("/sign-in/email", { email: "di@example.test", password: PASSWORD });
  const list = await D.call("/list-sessions");
  const revoke = await D.call("/revoke-other-sessions", {});
  const d2 = await D2.call("/get-session");
  expect(Array.isArray(list.body) && list.body.length === 2 && revoke.status === 200 && !d2.body, "'Sign out other devices' ends the other session on its next request", `sessions ${list.body?.length}, other device now ${short(d2)}`);
}

await sql.end();
