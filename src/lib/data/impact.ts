import "server-only"

import { seeable } from "@/lib/request-access"
import { and, eq } from "drizzle-orm"

import { db, projects, requests } from "@/db"
import type { MemberAuth } from "@/lib/auth-guard"
import { buildImpactDashboard, buildTeammateWork, type ImpactDashboard, type ImpactOptions, type ImpactRow, type MyWorkEntry } from "@/lib/impact-read-model"

// Loads the Requests the viewer may see (every Request in the workspace, or only the guest's own) and hands
// them to the impact read model. Identity and workspace come from the guard's session-derived `auth`, never
// from the client. Visibility is applied twice: here in SQL (seeable) and again in the read model.

/** The impact dashboard for the signed-in viewer. Screens render this and compute nothing themselves. */
export async function loadImpactDashboard(auth: MemberAuth, options: ImpactOptions = {}): Promise<ImpactDashboard> {
  const rows = await loadImpactRows(auth)
  return buildImpactDashboard({ userId: auth.userId, orgId: auth.orgId, role: auth.role }, rows, options)
}

export async function loadImpactRows(auth: MemberAuth): Promise<ImpactRow[]> {
  const rows = await db
    .select({
      id: requests.id,
      orgId: requests.orgId,
      requestNumber: requests.requestNumber,
      title: requests.title,
      createdBy: requests.createdBy,
      assignedTo: requests.assignedTo,
      projectId: requests.projectId,
      projectName: projects.name,
      status: requests.status,
      releaseState: requests.releaseState,
      outcomeClosure: requests.outcomeClosure,
      exceptionClosure: requests.exceptionClosure,
      closureCorrections: requests.closureCorrections,
      expectedImpact: requests.expectedImpact,
      noMeasurableImpactReason: requests.noMeasurableImpactReason,
      followUpOf: requests.followUpOf,
    })
    .from(requests)
    .leftJoin(projects, and(eq(requests.projectId, projects.id), eq(projects.orgId, auth.orgId)))
    .where(seeable(auth))

  return rows.map(row => ({ ...row, projectName: row.projectName ?? null }))
}

/** A teammate's Requests, requested or picked up, for a non-guest viewer (spec story 12). Null for a guest. */
export async function loadTeammateWork(auth: MemberAuth, personId: string, options: ImpactOptions = {}): Promise<MyWorkEntry[] | null> {
  const rows = await loadImpactRows(auth)
  return buildTeammateWork({ userId: auth.userId, orgId: auth.orgId, role: auth.role }, rows, personId, options)
}
