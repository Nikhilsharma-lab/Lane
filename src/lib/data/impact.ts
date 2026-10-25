import "server-only"

import { seeable } from "@/lib/request-access"
import { and, eq, inArray } from "drizzle-orm"

import { db, profiles, projects, quarterNotes, requests } from "@/db"
import type { MemberAuth } from "@/lib/auth-guard"
import { quarterOf, quartersOf, type ImpactPeriod, type Quarter } from "@/lib/impact-period"
import { buildDefinitionUses, buildImpactDashboard, buildTeammateWork, teammateIdsOf, type DefinitionUses, type ImpactDashboard, type ImpactDefinition, type ImpactViewer, type ImpactOptions, type ImpactRow, type MyWorkEntry, type QuarterNote, type Teammate } from "@/lib/impact-read-model"
import { resolveSavedMetrics, type ResolvedSavedMetric } from "@/lib/metrics-library"
import { FORMER_MEMBER } from "@/lib/request-journey"

// Loads the Requests the viewer may see (every Request in the workspace, or only the guest's own) and hands
// them to the impact read model. Identity and workspace come from the guard's session-derived `auth`, never
// from the client. Visibility is applied twice: here in SQL (seeable) and again in the read model.

/** The viewer the read model sees, from the guard's session-derived auth. One place builds it. */
function viewerOf(auth: MemberAuth): ImpactViewer {
  return { userId: auth.userId, orgId: auth.orgId, role: auth.role }
}

/** The Impact page for the signed-in viewer: My work and the Outcome report (#208). Screens render this and compute nothing themselves. */
export async function loadImpactDashboard(auth: MemberAuth, options: ImpactOptions = {}): Promise<ImpactDashboard> {
  const period = options.period ?? quarterOf(options.now ?? new Date())
  const [rows, notes] = await Promise.all([loadImpactRows(auth), loadQuarterNotes(auth, period)])
  return buildImpactDashboard(viewerOf(auth), rows, { ...options, period, quarterNotes: notes })
}

/**
 * The Quarter notes a period's report ends with (#209), each with its last editor's name. None for a guest, who gets
 * no Outcome report, and none for a month.
 */
async function loadQuarterNotes(auth: MemberAuth, period: ImpactPeriod): Promise<QuarterNote[]> {
  if (auth.role === "guest" || quartersOf(period).length === 0) return []
  const notes = await db
    .select({ year: quarterNotes.year, quarter: quarterNotes.quarter, text: quarterNotes.body, editorName: profiles.fullName, editedAt: quarterNotes.editedAt })
    .from(quarterNotes)
    .leftJoin(profiles, eq(profiles.id, quarterNotes.editedBy))
    .where(and(eq(quarterNotes.orgId, auth.orgId), eq(quarterNotes.year, period.year)))
  return notes.map(note => ({ ...note, quarter: note.quarter as Quarter, editorName: note.editorName || FORMER_MEMBER, editedAt: note.editedAt.toISOString() }))
}

export async function loadImpactRows(auth: MemberAuth): Promise<ImpactRow[]> {
  const rows = await db
    .select({
      id: requests.id,
      orgId: requests.orgId,
      requestNumber: requests.requestNumber,
      title: requests.title,
      description: requests.description,
      reframedProblem: requests.reframedProblem,
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

  // #201: totals and names follow the Metric definitions each Request's metrics resolve to now, through the Metrics
  // library. A closed result is judged against its frozen expectation; anything else against its Expected impact.
  const resolved = await resolveSavedMetrics({ orgId: auth.orgId }, rows.map(row => row.outcomeClosure?.expected ?? row.expectedImpact))
  return rows.map(({ description, reframedProblem, ...row }, index) => ({
    ...row,
    problem: reframedProblem ?? description,
    projectName: row.projectName ?? null,
    definitions: definitionsOf(resolved[index]),
  }))
}

function definitionsOf(metrics: ResolvedSavedMetric[]): ImpactDefinition[] {
  return metrics.flatMap(({ position, definition }) => definition ? [{ position, id: definition.id, name: definition.name, unit: definition.unit }] : [])
}

/**
 * Every Request the viewer may see that used one Metric definition (#203), for its page in the Metrics library.
 * Null for a guest. The same rows and rules as the Impact page, so visibility and results never differ.
 */
export async function loadDefinitionUses(auth: MemberAuth, definitionId: string, options: ImpactOptions = {}): Promise<DefinitionUses | null> {
  if (auth.role === "guest") return null
  return buildDefinitionUses(viewerOf(auth), await loadImpactRows(auth), definitionId, options)
}

/** A teammate's Requests, requested or picked up, for a non-guest viewer (spec story 12). Null for a guest. */
export async function loadTeammateWork(auth: MemberAuth, personId: string, options: ImpactOptions = {}): Promise<MyWorkEntry[] | null> {
  const rows = await loadImpactRows(auth)
  return buildTeammateWork(viewerOf(auth), rows, personId, options)
}

/** The people a non-guest may open a list for, by name, A to Z. Empty for a guest, who sees no one else. */
export async function loadTeammates(auth: MemberAuth): Promise<Teammate[]> {
  const ids = teammateIdsOf(viewerOf(auth), await loadImpactRows(auth)) ?? [];
  if (ids.length === 0) return [];
  const names = await db.select({ id: profiles.id, fullName: profiles.fullName }).from(profiles).where(inArray(profiles.id, ids));
  const byId = new Map(names.map(person => [person.id, person.fullName]));
  return ids.map(id => ({ id, name: byId.get(id) ?? FORMER_MEMBER })).sort((a, b) => a.name.localeCompare(b.name));
}
