// PROTOTYPE (#344). Without Lane's role allow-list, Better Auth accepts 'owner'
// on invite and role change even though Lane never defines it.
// Run: pnpm db:reset && PROTO_ROLE_GUARD=off npx tsx checks/owner-hole.ts
import { outbox } from "../lib/auth";
import { sql } from "../lib/db";
import { Browser, report, short } from "./client";

const PASSWORD = "violet-otter-344-lane";
const code = (e: string) => [...outbox.mail].reverse().find((m) => m.to === e)?.code;
async function person(name: string, email: string, ip: string) {
  const b = new Browser(name, ip);
  await b.call("/sign-up/email", { email, password: PASSWORD, name });
  await b.call("/email-otp/verify-email", { email, otp: code(email) });
  await b.call("/sign-in/email", { email, password: PASSWORD });
  return b;
}
const A = await person("Ada", "hole-ada@example.test", "198.51.100.1");
const E = await person("Eve", "hole-eve@example.test", "198.51.100.2");
const org = (await A.call("/organization/create", { name: "Hole", slug: "hole" })).body.id;
const inv = await A.call("/organization/invite-member", { email: "hole-eve@example.test", role: "owner", organizationId: org });
report(inv.status === 200 ? "FINDING" : "CONFIRMED", "Invite with role 'owner' (no allow-list)", short(inv).slice(0, 120));
await E.call("/organization/accept-invitation", { invitationId: inv.body?.id });
await E.call("/organization/set-active", { organizationId: org });
const eve = await E.call("/organization/get-active-member");
report("FINDING", `Accepted: Eve's member role is '${eve.body?.role}', which Lane's guards don't recognise`);
const perm = await E.call("/organization/has-permission", { permissions: { member: ["delete"], request: ["create"] }, organizationId: org });
report("INFO", `'owner' carries no Lane permissions: has-permission = ${perm.body?.success}`, "So it's a broken membership, not an escalation.");
const memId = (await A.call("/organization/get-active-member")).body?.id;
await A.call("/organization/set-active", { organizationId: org });
const toOwner = await A.call("/organization/update-member-role", { memberId: memId, role: "owner", organizationId: org });
report(toOwner.status === 200 ? "FINDING" : "INFO", "Admin changes their own role to 'owner'", short(toOwner).slice(0, 140));
await sql.end();
