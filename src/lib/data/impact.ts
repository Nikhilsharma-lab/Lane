import "server-only"

import { seeable } from "@/lib/request-access"
import { and, eq, inArray } from "drizzle-orm"

import { db, profiles, projects, requests } from "@/db"
import type { MemberAuth } from "@/lib/auth-guard"
import { buildImpactDashboard, buildTeammateWork, teammateIdsOf, type ImpactDashboard, type ImpactViewer, type ImpactOptions, type ImpactRow, type MyWorkEntry, type Teammate } from "@/lib/impact-read-model"
import { FORMER_MEMBER } from "@/lib/request-journey"

// Loads the Requests the viewer may see (every Request in the workspace, or only the guest's own) and hands
// them to the impact read model. Identity and workspace come from the guard's session-derived `auth`, never
// from the client. Visibility is applied twice: here in SQL (seeable) and again in the read model.

/** The viewer the read model sees, from the guard's session-derived auth. One place builds it. */
function viewerOf(auth: MemberAuth): ImpactViewer {
  return { userId: auth.userId, orgId: auth.orgId, role: auth.role }
}

/** One visible Request snapshot supplies the dashboard, people and optional teammate list. */
export async function loadImpactPage(auth: MemberAuth, options: ImpactOptions & { personId?: string } = {}): Promise<{
  dashboard: ImpactDashboard;
  teammates: Teammate[];
  person: { id: string; name: string; entries: MyWorkEntry[] } | null;
}> {
  const sharedOptions = { ...options, now: options.now ?? new Date() }
  const viewer = viewerOf(auth)
  const rows = await loadImpactRows(auth)
  const dashboard = buildImpactDashboard(viewer, rows, sharedOptions)
  const ids = teammateIdsOf(viewer, rows) ?? []
  const names = ids.length > 0
    ? await db.select({ id: profiles.id, fullName: profiles.fullName }).from(profiles).where(inArray(profiles.id, ids))
    : []
  const byId = new Map(names.map(person => [person.id, person.fullName]))
  const teammates = ids.map(id => ({ id, name: byId.get(id) ?? FORMER_MEMBER })).sort((a, b) => a.name.localeCompare(b.name))
  // URL identity is untrusted. Only people on this viewer's visible Request list are selectable.
  const chosen = teammates.find(person => person.id === options.personId)
  const entries = chosen ? buildTeammateWork(viewer, rows, chosen.id, sharedOptions) : null
  return { dashboard, teammates, person: chosen && entries ? { ...chosen, entries } : null }
}

async function loadImpactRows(auth: MemberAuth): Promise<ImpactRow[]> {
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
