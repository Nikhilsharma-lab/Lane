"use server";

import { revalidatePath } from "next/cache";
import * as z from "zod";
import type { AuthAnswer } from "@/lib/auth-answer";
import { guardActiveMember, type MemberAuth } from "@/lib/auth-guard";
import { askAuthServer } from "@/lib/auth-server";
import { inMembershipTurn } from "@/lib/membership-turn";
import { managesWorkspace } from "@/lib/role-rules";

/**
 * #395 (spec #383, stories 53–56): renaming the workspace, and leaving it. The workspace comes from the page, and must
 * be the one the session is in; the person and their role come only from the session.
 */
const renameSchema = z.object({ name: z.string().trim().min(1) });

/** The person as a member of the page's workspace, or the code of why not. */
async function memberHere(orgId: string): Promise<MemberAuth | { ok: false; code: string }> {
  const member = await guardActiveMember(orgId, "");
  if (!("error" in member)) return member;
  return { ok: false, code: member.sessionExpired ? "UNAUTHORIZED" : "WORKSPACE_NOT_OPEN" };
}

/** Renames the workspace; an Admin's. Every page then shows the new name. */
export async function renameWorkspace(data: { name: string }, context: { orgId: string }): Promise<AuthAnswer> {
  const member = await memberHere(context.orgId);
  if ("ok" in member) return member;
  if (!managesWorkspace(member.role)) return { ok: false, code: "YOU_ARE_NOT_ALLOWED_TO_UPDATE_THIS_ORGANIZATION" };
  const parsed = renameSchema.safeParse(data);
  if (!parsed.success) return { ok: false };
  const renamed = await askAuthServer((api, asCaller) =>
    api.updateOrganization({ ...asCaller, body: { organizationId: member.orgId, data: { name: parsed.data.name } } }));
  if (!renamed.ok) return renamed;
  revalidatePath("/", "layout");
  return { ok: true };
}

/**
 * Takes the person out of the workspace, whatever their role; Better Auth refuses its only Admin. Their Requests and
 * comments stay. It redraws nothing: the page is of a workspace they're no longer in, and the caller loads `/`.
 */
export async function leaveWorkspace(context: { orgId: string }): Promise<AuthAnswer> {
  const member = await memberHere(context.orgId);
  if ("ok" in member) return member;
  const left = await inMembershipTurn(member.orgId, () =>
    askAuthServer((api, asCaller) => api.leaveOrganization({ ...asCaller, body: { organizationId: member.orgId } })));
  return left.ok ? { ok: true } : left;
}
