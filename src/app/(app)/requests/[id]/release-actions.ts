'use server';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db, requests } from '@/db';
import { plannedDay } from '@/lib/dates';
import { requireActiveMember } from '@/lib/auth-guard';
import { workspaceRoster } from '@/lib/workspace-roster';
import type { RequestChangeContext } from '@/lib/request-reviewer-rules';
import { changeRequest, insist } from '@/lib/request-change-store';
import { seeable } from '@/lib/request-access';
import { expectedImpactSchema } from '@/lib/request-impact';
import { releaseChangeSchema, releaseWindow, releaseMeasurement, earliestExposure, valueBeforeReleaseOf, type ReleaseState } from '@/lib/request-release';
import { journeyStatus, requesterOf } from '@/lib/request-journey';
import { valueBeforeReleaseFor } from '@/lib/request-release-facts';
import { allow, journeyActionsFor, peopleNames, personName, rosterMember } from '@/lib/request-journey-access';
import { utcDay } from '@/lib/utc-day';
/** The Request is what was agreed, so its "Users" are the agreed audience. */
const agreedAudience = (request: { affectedPeople: string | null }) => request.affectedPeople?.trim() || 'Everyone this Request is for';
/** Each release change and the journey action that allows it. */
const JOURNEY_ACTION = { release: 'release', correct: 'correctRelease', void: 'voidRelease', transfer: 'handover' } as const;
export async function changeRequestRelease(context: RequestChangeContext, input: unknown) {
    const parsed = releaseChangeSchema.safeParse(input);
    if (!parsed.success) return { error: 'Check the exposure date, evidence, confirmation, value before release and reason.' };
    const change = parsed.data;
    const fingerprint = { requestId: context.requestId, change };
    return changeRequest(context, {
        fingerprint,
        messages: { invalid: 'Invalid release action.', forbidden: 'You cannot change release in this workspace.', failed: 'Could not save release. Your input is preserved; try again.' },
        // Release records each change in its own history, which is also how a retry replays.
        replayOf: (_tx, request) => {
            const previous = request.releaseState?.history.find(e => e.operationId === context.operationId);
            return previous && { actorId: previous.actorId, fingerprint: previous.fingerprint, result: { success: true as const, revision: previous.revision } };
        },
        apply: async (tx, { request, auth, roster, revision, fingerprint }) => {
            const requesterId = requesterOf(request);
            // Release, correct and void: any active member while Done or Measuring. Handover: an admin, from pickup, once the Requester has lost access.
            const actions = journeyActionsFor(request, auth, roster, await personName(tx, roster, requesterId), new Date());
            allow(actions[JOURNEY_ACTION[change.kind]]);
            // Before any release, a handover starts the release record with no release.
            const state: ReleaseState = request.releaseState ?? { version: 1, ownerId: requesterId, release: null, history: [] };
            const before = state.release;
            let nextRequester = requesterId;
            let nextRelease = before;
            if (change.kind === 'transfer') {
                insist(rosterMember(roster, change.recipientId), 'Choose an active non-guest workspace member.');
                nextRequester = change.recipientId;
            }
            else {
                if (change.kind === 'void') {
                    nextRelease = null;
                }
                else {
                    insist(change.exposureDate <= utcDay(), 'Exposure cannot be in the future.');
                    const earliest = earliestExposure(request);
                    insist(change.exposureDate >= earliest, `Exposure cannot be before the Request was created on ${plannedDay(earliest)}.`);
                    // A measured plan records the value before release, in its metric's unit, or the release is refused.
                    const impact = expectedImpactSchema.safeParse(request.expectedImpact).data ?? null;
                    const valueBefore = valueBeforeReleaseOf(impact);
                    // The value is kept in this change's history entry (valueBeforeReleaseFor reads it back), never in the release fact.
                    if (valueBefore.required) {
                        insist(change.valueBeforeRelease, 'Enter the value before release.');
                        insist(change.valueBeforeRelease.unit === valueBefore.unit, `Enter the value before release in ${valueBefore.unit}.`);
                    }
                    nextRelease = { exposureDate: change.exposureDate, evidence: change.evidence, audience: agreedAudience(request), ...releaseWindow(impact, change.exposureDate) };
                }
            }
            const next: ReleaseState = { version: 1, ownerId: nextRequester, release: nextRelease, history: [...state.history, { operationId: context.operationId, fingerprint, actorId: auth.userId, at: new Date().toISOString(), input: change, previousRelease: before, release: nextRelease, previousOwnerId: requesterId, ownerId: nextRequester, revision }] };
            return { set: { releaseState: next } };
        },
    });
}
export async function readRequestRelease(requestId: string, context: {
    orgId: string;
}) {
    try {
        insist(z.uuid().safeParse(requestId).success, 'Request unavailable.');
        const auth = await requireActiveMember(context.orgId);
        insist(auth, 'Request unavailable.');
        const [request] = await db.select().from(requests).where(and(eq(requests.id, requestId), seeable(auth)));
        insist(request, 'Request unavailable.');
        const requesterId = requesterOf(request);
        // Null when it can't be read (or for guests, who get no roster): saved facts stay readable, actions don't.
        let roster: Awaited<ReturnType<typeof workspaceRoster>> | null = null;
        if (auth.role !== 'guest') {
            try {
                roster = await workspaceRoster(auth.orgId);
            }
            catch { /* Saved facts remain readable during provider outages. */ }
        }
        const people = roster ?? [];
        const release = request.releaseState?.release ?? null;
        const history = request.releaseState?.history ?? [];
        // Saved profile names cover departed Requesters and guests, who receive no fresh roster.
        const names = await peopleNames(db, roster, [requesterId, ...history.flatMap(e => [e.actorId, e.previousOwnerId, e.ownerId])]);
        const now = new Date();
        // Every journey action with its reason, from the same rules the actions refuse with.
        const actions = journeyActionsFor(request, auth, roster, names[requesterId], now);
        return {
            requestId, revision: request.agreementRevision, requesterId, requesterName: names[requesterId], names,
            journey: journeyStatus(request), actions, workStatus: request.status, pickedUpAt: request.pickedUpAt?.toISOString() ?? null, doneAt: request.doneAt?.toISOString() ?? null,
            release, measurement: releaseMeasurement(release, now), today: utcDay(now),
            valueBefore: valueBeforeReleaseOf(expectedImpactSchema.safeParse(request.expectedImpact).data ?? null),
            recordedValueBefore: valueBeforeReleaseFor(request.releaseState, release),
            audience: agreedAudience(request),
            earliestExposure: earliestExposure(request),
            people: auth.role === 'admin' ? people.flatMap(p => p.nominee.kind === 'member' ? [{ id: p.nominee.userId, name: p.name }] : []) : [],
            history: history.map(event => ({ actorId: event.actorId, at: event.at, input: event.input, previousRelease: event.previousRelease, release: event.release, previousOwnerId: event.previousOwnerId, ownerId: event.ownerId, revision: event.revision })),
        };
    }
    catch {
        return { error: 'Could not load release. Try again.' };
    }
}
