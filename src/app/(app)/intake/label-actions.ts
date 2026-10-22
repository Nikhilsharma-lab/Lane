"use server";
import { and, eq, isNull, sql } from "drizzle-orm";
import { db, workspaceLabels } from "@/db";
import { requireActiveMember, requireMemberOrAbove, refusal } from "@/lib/auth-guard";
import { DEFAULT_LABELS, labelInputSchema, type RequestLabel } from "@/lib/request-labels";
import { canUseProject } from "@/lib/project-access";
import { loadLabels } from "@/lib/data/labels";
const selection = { id: workspaceLabels.id, name: workspaceLabels.name, colour: workspaceLabels.colour, projectId: workspaceLabels.projectId };
export async function listLabels(context: {orgId:string}): Promise<{success:true; labels:RequestLabel[]; canCreate:boolean} | {success:false; error:string}> {
 const auth=await requireActiveMember(context.orgId);
 if (!auth) return {success:false,error:await refusal("You do not have access to this workspace.")};
 try {
  return {success:true,...await loadLabels(auth)};
 } catch {return {success:false,error:"Labels could not be loaded. Try again."};}
}
export async function createLabel(input:unknown,context:{orgId:string}): Promise<{success:true;label:RequestLabel} | {success:false;error:string}> {
 const auth=await requireMemberOrAbove(context.orgId);
 if (!auth) return {success:false,error:await refusal("Only workspace members and admins can create labels.")};
 const parsed=labelInputSchema.safeParse(input);
 if (!parsed.success) return {success:false,error:parsed.error.issues[0].message};
 const projectId=parsed.data.projectId ?? null;
 if (!await canUseProject(projectId,auth)) return {success:false,error:"This Project is unavailable in this workspace."};
 const existingDefault=!projectId && DEFAULT_LABELS.find(label=>label.name.toLowerCase()===parsed.data.name.toLowerCase());
 if(existingDefault) return {success:true,label:existingDefault};
 try {
  const [created]=await db.insert(workspaceLabels).values({...parsed.data,projectId,orgId:auth.orgId,createdBy:auth.userId}).onConflictDoNothing().returning(selection);
  if(created) return {success:true,label:created};
  const [existing]=await db.select(selection).from(workspaceLabels).where(and(eq(workspaceLabels.orgId,auth.orgId),projectId ? eq(workspaceLabels.projectId,projectId) : isNull(workspaceLabels.projectId),eq(sql`lower(${workspaceLabels.name})`,sql`lower(${parsed.data.name})`))).limit(1);
  if(existing) return {success:true,label:existing};
 } catch { /* Draft stays available for retry. */ }
 return {success:false,error:"The label could not be created. Try again."};
}
