import "server-only";

import { clerkClient } from "@clerk/nextjs/server";
import { eq } from "drizzle-orm";

import { db, freeRequestAllowances, workspaceBilling, workspaces } from "@/db";
import { billingEnforced } from "./feature-switches";
import { allowanceKeyOf, creationBlock, freeRequestsOf, type FreeRequests, type FreeRequestsState, type PlanState } from "./free-request-rules";
import type { RequestTx } from "./request-change-store";

/**
 * #213 (spec #195, item 5): the billing module. It owns the Free Requests count and the plan state; nothing else
 * reads or writes `workspace_billing` or `free_request_allowances`. The count itself is kept by the database
 * (migration 0046): every Request created counts, deleted ones too, and a Guest submission once it is taken on.
 * Access is the caller's job: pages and actions guard the role, then pass only `{ orgId }`.
 *
 * There is no payment provider yet (#214); `planState` stays `free` until one sets it.
 */

type Workspace = { orgId: string };
type Exec = typeof db | RequestTx;

async function stateOf(exec: Exec, orgId: string): Promise<FreeRequestsState> {
  const [row] = await exec
    .select({ planState: workspaceBilling.planState, used: workspaceBilling.freeRequestsUsed, key: workspaceBilling.allowanceKey, held: workspaceBilling.holdsAllowance })
    .from(workspaceBilling)
    .where(eq(workspaceBilling.orgId, orgId));
  if (!row) return { planState: "free", used: 0, allowance: null };
  const allowance = row.key === null || row.held === null ? null : allowanceOfKey(row.key, row.held);
  return { planState: row.planState, used: row.used, allowance };
}

/** The kind and domain a stored allowance key names (a personal one is a whole address). */
function allowanceOfKey(key: string, held: boolean): FreeRequestsState["allowance"] {
  const at = key.indexOf("@");
  return at < 0 ? { kind: "company_domain", domain: key, held } : { kind: "personal_email", domain: key.slice(at + 1), held };
}

export type WorkspaceFreeRequests = { planState: PlanState; free: FreeRequests };

/** What Settings → Billing shows: the plan state and the Free Requests left. */
export async function readFreeRequests(ws: Workspace): Promise<WorkspaceFreeRequests> {
  const state = await stateOf(db, ws.orgId);
  return { planState: state.planState, free: freeRequestsOf(state) };
}

/** Whether this workspace's allowance has been decided (looked up for its creator). */
export async function freeRequestsDecided(ws: Workspace): Promise<boolean> {
  return (await stateOf(db, ws.orgId)).allowance !== null;
}

/**
 * Claims the Free Requests of the allowance `creatorEmail` names for this workspace: the first workspace to claim
 * a company domain (or a personal address) holds it, and any later one is told they were already used. Decided
 * once; an address that names no allowance (or none at all) leaves it undecided.
 */
export async function claimFreeRequests(ws: Workspace, creatorEmail: string | null): Promise<void> {
  const allowance = creatorEmail ? allowanceKeyOf(creatorEmail) : null;
  if (!allowance) return;
  await db.transaction(async (tx) => {
    await tx.insert(workspaceBilling).values({ orgId: ws.orgId }).onConflictDoNothing();
    const [row] = await tx.select({ held: workspaceBilling.holdsAllowance }).from(workspaceBilling).where(eq(workspaceBilling.orgId, ws.orgId)).for("update");
    if (row?.held !== null) return;
    await tx.insert(freeRequestAllowances).values({ allowanceKey: allowance.key, kind: allowance.kind, orgId: ws.orgId }).onConflictDoNothing();
    const [holder] = await tx.select({ orgId: freeRequestAllowances.orgId }).from(freeRequestAllowances).where(eq(freeRequestAllowances.allowanceKey, allowance.key));
    await tx.update(workspaceBilling).set({ allowanceKey: allowance.key, holdsAllowance: holder?.orgId === ws.orgId }).where(eq(workspaceBilling.orgId, ws.orgId));
  });
}

/**
 * Decides the workspace's allowance from its creator in Clerk, if it isn't decided yet. `known` is what the caller
 * already has: the Clerk organization's creator and the signed-in person, whose address needs no lookup. Never
 * throws: a workspace whose creator can't be found stays undecided, and so keeps its 4 Free Requests.
 */
export async function decideFreeRequests(ws: Workspace, known?: { createdBy: string | null | undefined; userId: string; email: string }): Promise<void> {
  try {
    if (await freeRequestsDecided(ws)) return;
    const client = await clerkClient();
    const createdBy = known ? known.createdBy : (await client.organizations.getOrganization({ organizationId: ws.orgId })).createdBy;
    if (!createdBy) return;
    const email = known && createdBy === known.userId
      ? known.email
      : await client.users.getUser(createdBy).then((user) => user.primaryEmailAddress?.emailAddress ?? user.emailAddresses[0]?.emailAddress ?? null);
    await claimFreeRequests(ws, email);
  } catch (error) {
    console.error("[billing] Free Requests allowance not decided:", error instanceof Error ? error.message : "unknown error");
  }
}

/**
 * Why a new Request (or taking on a Guest submission) is refused right now, or null to go ahead. Nothing is
 * refused while billing isn't enforced, and then this reads nothing. Inside a transaction it first locks the
 * workspace's row, the same lock that numbers new Requests, so two people can't both file the last Free Request.
 * Outside one (the early check before the AI review) it also decides an undecided allowance.
 */
export async function newRequestBlock(ws: Workspace, tx?: RequestTx): Promise<string | null> {
  if (!billingEnforced()) return null;
  if (tx) await tx.select({ id: workspaces.id }).from(workspaces).where(eq(workspaces.id, ws.orgId)).for("update");
  else await decideFreeRequests(ws);
  return creationBlock(await stateOf(tx ?? db, ws.orgId), { enforced: true });
}
