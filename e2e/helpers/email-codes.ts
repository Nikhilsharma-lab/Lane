import { createHash } from "node:crypto";
import type postgres from "postgres";
import { withE2EDatabase } from "./database";
import { assertReservedEmail } from "./fixtures";

/**
 * The one owner of how Better Auth keeps an emailed code (its email-otp plugin with `storeOTP: "hashed"`): a
 * `verification` row named `<type>-otp-<email>` whose value is `<unpadded base64url SHA-256 of the code>:<wrong tries>`.
 */
export type CodeType = "email-verification" | "sign-in" | "forget-password";

const identifierOf = (type: CodeType, email: string) => `${type}-otp-${email}`;
const storedCode = (code: string) => `${createHash("sha256").update(code).digest("base64url")}:0`;

/**
 * Replaces the code Lane just emailed to an address this worker reserved with one the test chose, and returns it. Its
 * lifetime stays the emailed one's. Throws when no code is waiting, so call it once the screen asks for the code.
 */
export async function replaceEmailCode(email: string, type: CodeType, code = "246810"): Promise<string> {
  assertReservedEmail(email);
  const { count } = await withE2EDatabase((sql) => sql`
    update verification set value = ${storedCode(code)} where identifier = ${identifierOf(type, email)} and expires_at > now()
  `);
  if (count === 0) throw new Error(`[e2e] No ${type} code is waiting for that address.`);
  return code;
}

/** Deletes every code kept for the address. */
export async function deleteEmailCodes(sql: postgres.Sql, email: string): Promise<void> {
  const types: CodeType[] = ["email-verification", "sign-in", "forget-password"];
  await sql`delete from verification where identifier in ${sql(types.map((type) => identifierOf(type, email)))}`;
}
