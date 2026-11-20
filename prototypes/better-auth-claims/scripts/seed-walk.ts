// PROTOTYPE (#344). Two verified people in one workspace for the browser walk:
// walk@ (Admin) and boss@ (Admin, used to change walk@'s role mid-walk).
import { outbox } from "../lib/auth";
import { sql } from "../lib/db";
import { Browser } from "../checks/client";

const PASSWORD = "violet-otter-344-lane";
async function person(name: string, email: string, ip: string) {
  const b = new Browser(name, ip);
  await b.call("/sign-up/email", { email, password: PASSWORD, name });
  await b.call("/email-otp/verify-email", { email, otp: [...outbox.mail].reverse().find((m) => m.to === email)!.code });
  await b.call("/sign-in/email", { email, password: PASSWORD });
  return b;
}
const boss = await person("Bo Boss", "boss@example.test", "198.51.100.10");
const walk = await person("Wren Walker", "walk@example.test", "198.51.100.11");
const org = (await boss.call("/organization/create", { name: "Walk Studio", slug: "walk-studio" })).body.id;
const inv = await boss.call("/organization/invite-member", { email: "walk@example.test", role: "admin", organizationId: org });
await walk.call("/organization/accept-invitation", { invitationId: inv.body.id });
await sql`delete from session`;
await sql`delete from rate_limit`;
console.log(`seeded workspace ${org}`);
await sql.end();
