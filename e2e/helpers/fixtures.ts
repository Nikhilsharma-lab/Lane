import { randomUUID } from "node:crypto";
import { withE2EDatabase } from "./database";

// Worker-local receipts: interrupted runs intentionally leave fixtures for
// explicit inspection, never a future name/email-prefix sweep.
//
// #399: a person is this run's when the worker holds their receipt and their row's email carries the run's prefix; a
// workspace, when the worker holds its receipt and its row's creator is the person named on it.
const runId = randomUUID().slice(0, 8);
/** Resend's documented test recipient: a send succeeds and reaches nobody. */
const EMAIL_PREFIX = `delivered+lane-e2e-${runId}-`;
const EMAIL_DOMAIN = "@resend.dev";
const reservedEmails = new Set<string>();
/** Person id → the address they were made with. */
const users = new Map<string, string>();
/** Workspace id → its creator's id. */
const organizations = new Map<string, string>();

/**
 * An address only this run uses, reserved by it: `delivered+lane-e2e-<run>-<n>-<label>@resend.dev`. Every worker
 * process has its own run, so two never make the same one. Lower case, as Better Auth keeps every address, and
 * within the 64 characters an address's local part may have.
 */
export function testEmail(label: string) {
  const name = label.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 24);
  const email = `${EMAIL_PREFIX}${reservedEmails.size + 1}-${name}${EMAIL_DOMAIN}`;
  reservedEmails.add(email);
  return email;
}

/** Throws unless this worker reserved the address with `testEmail`. */
export function assertReservedEmail(email: string) {
  if (!reservedEmails.has(email)) throw new Error("[e2e] Email was not reserved by this worker.");
}

export function recordCreatedUser(id: string, email: string) {
  users.set(id, email);
}
export function recordCreatedOrganization(id: string, userId: string) {
  organizations.set(id, userId);
}
export function forgetOrganization(id: string) {
  organizations.delete(id);
}
export function forgetUser(id: string) {
  users.delete(id);
}

/** The person's row while it's there. Throws unless this run owns them. */
async function ownedUser(id: string) {
  if (!users.has(id)) throw new Error("[e2e] User has no creation receipt in this worker.");
  const [row] = await withE2EDatabase((sql) => sql<{ id: string; email: string }[]>`select id, email from profiles where id = ${id}`);
  if (row && !(row.email.startsWith(EMAIL_PREFIX) && row.email.endsWith(EMAIL_DOMAIN)))
    throw new Error("[e2e] User's email does not carry this run's prefix.");
  return row;
}

/** Throws unless this run made the person and they're still there. */
export async function assertOwnedUser(id: string): Promise<void> {
  if (!(await ownedUser(id))) throw new Error("[e2e] User no longer exists.");
}

/** Throws unless this run made the workspace, for a person it made, and both are still there. */
export async function assertOwnedOrganization(id: string): Promise<void> {
  const ownerId = organizations.get(id);
  if (!ownerId) throw new Error("[e2e] Workspace has no creation receipt in this worker.");
  await assertOwnedUser(ownerId);
  const [row] = await withE2EDatabase((sql) => sql<{ owner_id: string | null }[]>`select owner_id from organizations where id = ${id}`);
  if (row?.owner_id !== ownerId) throw new Error("[e2e] Workspace ownership does not match.");
}

/**
 * What deleting this person may touch: their row, while it's there, and the workspaces this run made for them.
 * Refuses a person this run didn't make, and one who is in, or is the creator of, a workspace it didn't make.
 */
export async function ownedUserScope(id: string) {
  const user = await ownedUser(id);
  if (!user) return { user: null, orgIds: [] };
  const theirs = await withE2EDatabase((sql) => sql<{ id: string }[]>`
    select organization_id as id from member where user_id = ${id}
    union select id from organizations where owner_id = ${id}
  `);
  if (theirs.some((org) => !organizations.has(org.id))) {
    throw new Error("[e2e] User is in a workspace this worker didn't make; refusing cleanup.");
  }
  const orgIds = theirs.map((org) => org.id).filter((org) => organizations.get(org) === id);
  for (const orgId of orgIds) await assertOwnedOrganization(orgId);
  return { user, orgIds };
}

/** The id of the person this run made with this address. */
export async function ownedUserIdByEmail(email: string): Promise<string> {
  const id = [...users].find(([, address]) => address === email)?.[0];
  if (!id) throw new Error("[e2e] User has no creation receipt in this worker.");
  await assertOwnedUser(id);
  return id;
}

/** Takes a receipt for a person the browser made (a real sign-up), at an address this worker reserved. */
export async function registerBrowserTestUser(id: string, email: string) {
  assertReservedEmail(email);
  const [row] = await withE2EDatabase((sql) => sql<{ email: string }[]>`select email from profiles where id = ${id}`);
  if (row?.email !== email) throw new Error("[e2e] Browser user is not the newly created fixture.");
  recordCreatedUser(id, email);
}

/** Takes a receipt for a workspace the browser made, created by a person this run made. */
export async function registerBrowserTestOrganization(id: string, userId: string, name: string) {
  await assertOwnedUser(userId);
  const [row] = await withE2EDatabase((sql) => sql<{ name: string; owner_id: string | null }[]>`select name, owner_id from organizations where id = ${id}`);
  if (row?.owner_id !== userId || row.name !== name) {
    throw new Error("[e2e] Browser workspace is not the newly created fixture.");
  }
  recordCreatedOrganization(id, userId);
}
