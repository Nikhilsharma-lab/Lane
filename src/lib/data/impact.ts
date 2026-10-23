import "server-only"

import { seeable } from "@/lib/request-access"
import { and, eq, inArray } from "drizzle-orm"

import { db, profiles, projects, requests } from "@/db"
import type { MemberAuth } from "@/lib/auth-guard"
import { buildImpactDashboard, buildTeammateWork, teammateIdsOf, type ImpactDashboard, type ImpactOptions, type ImpactRow, type MyWorkEntry, type Teammate } from "@/lib/impact-read-model"
import { FORMER_MEMBER } from "@/lib/request-journey"

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

/** The people a non-guest may open a list for, by name, A to Z. Empty for a guest, who sees no one else. */
export async function loadTeammates(auth: MemberAuth): Promise<Teammate[]> {
  const ids = teammateIdsOf({ userId: auth.userId, orgId: auth.orgId, role: auth.role }, await loadImpactRows(auth)) ?? [];
  if (ids.length === 0) return [];
  const names = await db.select({ id: profiles.id, fullName: profiles.fullName }).from(profiles).where(inArray(profiles.id, ids));
  const byId = new Map(names.map(person => [person.id, person.fullName]));
  return ids.map(id => ({ id, name: byId.get(id) ?? FORMER_MEMBER })).sort((a, b) => a.name.localeCompare(b.name));
}
