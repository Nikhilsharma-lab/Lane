import "server-only";
import { and, asc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db, requests, requestAgreementEvents } from "@/db";
import { guardActiveMember } from "@/lib/auth-guard";
import { seeable } from "@/lib/request-access";
import { workspaceRoster } from "@/lib/workspace-roster";
import { peopleNames, journeyActionsFor } from "@/lib/request-journey-access";
import { journeyStatus, requesterOf } from "@/lib/request-journey";
import { expectedImpactSchema } from "@/lib/request-impact";
import { earliestExposure, releaseMeasurement, valueBeforeReleaseOf } from "@/lib/request-release";
import { agreedAudience, valueBeforeReleaseFor } from "@/lib/request-release-facts";
import { agreedResult, guardrailHeld } from "@/lib/request-outcome";
import { utcDay } from "@/lib/utc-day";

const RELEASE_FAILED = "Couldn't load release. Try again.";
const OUTCOME_FAILED = "Couldn't load the outcome. Try again.";
const JOURNEY_FAILED = "Couldn't load the journey. Try again.";

/** One visible Request and viewer snapshot. Follow-up queries belong only to
 * Outcome. A missing roster keeps saved facts readable and permissions closed. */
async function loadContext(requestId: string, orgId: string, part: "release" | "outcome" | "journey", copy: string) {
  if (!z.uuid().safeParse(requestId).success) return { error: copy };
  const auth = await guardActiveMember(orgId, copy);
  if ("error" in auth) return auth;
  const [request] = await db.select().from(requests).where(and(eq(requests.id, requestId), seeable(auth)));
  if (!request) return { error: copy };
  let roster: Awaited<ReturnType<typeof workspaceRoster>> | null = null;
  if (auth.role !== "guest") {
    try { roster = await workspaceRoster(auth.orgId); }
    catch { /* Saved history stays readable; membership cannot be guessed. */ }
  }
  const requesterId = requesterOf(request);
  const closure = request.outcomeClosure ?? request.exceptionClosure;
  const ids = [requesterId,
    ...(part !== "outcome" ? (request.releaseState?.history ?? []).flatMap(e => [e.actorId, e.previousOwnerId, e.ownerId]) : []),
    ...(part !== "release" ? [...(closure ? [closure.actorId] : []), ...request.closureCorrections.map(c => c.actorId)] : []),
  ];
  const names = await peopleNames(db, roster, ids);
  const now = new Date();
  const release = request.releaseState?.release ?? null;
  const expected = expectedImpactSchema.safeParse(request.expectedImpact).data ?? null;
  const common = {
    requestId, revision: request.agreementRevision, requesterId, requesterName: names[requesterId], names,
    journey: journeyStatus(request), actions: journeyActionsFor(request, auth, roster, names[requesterId], now),
    release, measurement: releaseMeasurement(release, now),
  };
  return { request, auth, roster, now, expected, common };
}
type Context = Exclude<Awaited<ReturnType<typeof loadContext>>, { error: string }>;

function releaseView({ request, auth, roster, now, expected, common }: Context) {
  return {
    ...common, workStatus: request.status, pickedUpAt: request.pickedUpAt?.toISOString() ?? null, doneAt: request.doneAt?.toISOString() ?? null,
    today: utcDay(now), valueBefore: valueBeforeReleaseOf(expected),
    recordedValueBefore: valueBeforeReleaseFor(request.releaseState, common.release),
    audience: agreedAudience(request), earliestExposure: earliestExposure(request),
    people: auth.role === "admin" ? (roster ?? []).flatMap(p => p.nominee.kind === "member" ? [{ id: p.nominee.userId, name: p.name }] : []) : [],
    history: (request.releaseState?.history ?? []).map(event => ({ actorId: event.actorId, at: event.at, input: event.input, previousRelease: event.previousRelease, release: event.release, previousOwnerId: event.previousOwnerId, ownerId: event.ownerId, revision: event.revision })),
  };
}

async function outcomeView({ request, auth, expected, common }: Context) {
  const closure = request.outcomeClosure
    ? { ...request.outcomeClosure, guardrails: request.outcomeClosure.guardrails.map(g => ({ ...g, held: guardrailHeld(g) })) }
    : request.exceptionClosure;
  const visible = seeable(auth);
  const followRows = await db.select({ id: requests.id, title: requests.title, requestNumber: requests.requestNumber, createdBy: requests.createdBy, createdAt: requests.createdAt }).from(requests).where(and(eq(requests.orgId, auth.orgId), eq(requests.followUpOf, request.id), visible)).orderBy(asc(requests.createdAt), asc(requests.id));
  const reasons = followRows.length ? await db.select({ requestId: requestAgreementEvents.requestId, payload: requestAgreementEvents.payload }).from(requestAgreementEvents).where(and(eq(requestAgreementEvents.orgId, auth.orgId), eq(requestAgreementEvents.kind, "follow_up_created"), inArray(requestAgreementEvents.requestId, followRows.map(f => f.id)))) : [];
  const parent = request.followUpOf ? (await db.select({ id: requests.id, title: requests.title, requestNumber: requests.requestNumber }).from(requests).where(and(eq(requests.id, request.followUpOf), visible)))[0] : undefined;
  return {
    ...common,
    state: closure ? "closed" as const : common.release ? "measuring" as const : "not_started" as const,
    agreed: request.status !== "open" && expected ? agreedResult(expected) : null,
    closure: closure ?? null, corrections: request.closureCorrections,
    followUpOf: parent ?? null,
    followUps: followRows.map(f => ({ ...f, createdAt: f.createdAt.toISOString(), reason: String((reasons.find(r => r.requestId === f.id)?.payload.input as { reason?: string } | undefined)?.reason ?? "") })),
  };
}

export async function loadRequestRelease(requestId: string, context: { orgId: string }) {
  try {
    const loaded = await loadContext(requestId, context.orgId, "release", RELEASE_FAILED);
    return "error" in loaded ? loaded : releaseView(loaded);
  } catch { return { error: RELEASE_FAILED }; }
}
export async function loadRequestOutcome(requestId: string, context: { orgId: string }) {
  try {
    const loaded = await loadContext(requestId, context.orgId, "outcome", OUTCOME_FAILED);
    return "error" in loaded ? loaded : await outcomeView(loaded);
  } catch { return { error: OUTCOME_FAILED }; }
}
export async function loadRequestJourney(requestId: string, context: { orgId: string }) {
  try {
    const loaded = await loadContext(requestId, context.orgId, "journey", JOURNEY_FAILED);
    if ("error" in loaded) return loaded;
    return { release: releaseView(loaded), outcome: await outcomeView(loaded), rosterUnavailable: loaded.auth.role !== "guest" && loaded.roster === null };
  } catch { return { error: JOURNEY_FAILED }; }
}
