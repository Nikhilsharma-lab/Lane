"use server";

import { revalidatePath } from "next/cache";
import type { AuthAnswer } from "@/lib/auth-answer";
import { activeMemberOrCode } from "@/lib/auth-guard";
import { askAuthServer } from "@/lib/auth-server";
import { inMembershipTurn } from "@/lib/membership-turn";
import { readName } from "@/lib/name-rules";
import { managesWorkspace } from "@/lib/role-rules";

/**
 * #395 (spec #383, stories 53–56): renaming the workspace, and leaving it. The workspace comes from the page, and must
 * be the one the session is in; the person and their role come only from the session.
 */
/** Renames the workspace; an Admin's. Every page then shows the new name. */
export async function renameWorkspace(data: { name: string }, context: { orgId: string }): Promise<AuthAnswer> {
  const member = await activeMemberOrCode(context.orgId);
  if ("ok" in member) return member;
  if (!managesWorkspace(member.role)) return { ok: false, code: "YOU_ARE_NOT_ALLOWED_TO_UPDATE_THIS_ORGANIZATION" };
  const read = readName(data.name);
  if (!read.ok) return read;
  const renamed = await askAuthServer((api, asCaller) =>
    api.updateOrganization({ ...asCaller, body: { organizationId: member.orgId, data: { name: read.name } } }));
  if (!renamed.ok) return renamed;
  revalidatePath("/", "layout");
  return { ok: true };
}

/**
 * Takes the person out of the workspace, whatever their role; Better Auth refuses its only Admin. Their Requests and
 * comments stay. It redraws nothing: the page is of a workspace they're no longer in, and the caller loads `/`.
 */
export async function leaveWorkspace(context: { orgId: string }): Promise<AuthAnswer> {
  const member = await activeMemberOrCode(context.orgId);
  if ("ok" in member) return member;
  const left = await inMembershipTurn(member.orgId, () =>
    askAuthServer((api, asCaller) => api.leaveOrganization({ ...asCaller, body: { organizationId: member.orgId } })));
  return left.ok ? { ok: true } : left;
}
