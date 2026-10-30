'use server';
import { plannedDay } from '@/lib/dates';
import { loadRequestRelease } from '@/lib/data/request-journey';
import type { RequestChangeContext } from '@/lib/request-reviewer-rules';
import { changeRequest, insist } from '@/lib/request-change-store';
import { expectedImpactSchema } from '@/lib/request-impact';
import { releaseChangeSchema, releaseWindow, earliestExposure, valueBeforeReleaseOf, type ReleaseState } from '@/lib/request-release';
import { requesterOf } from '@/lib/request-journey';
import { agreedAudience } from '@/lib/request-release-facts';
import { allow, journeyActionsFor, personName, rosterMember } from '@/lib/request-journey-access';
import { utcDay } from '@/lib/utc-day';
/** Each release change and the journey action that allows it. */
const JOURNEY_ACTION = { release: 'release', correct: 'correctRelease', void: 'voidRelease', transfer: 'handover' } as const;
export async function changeRequestRelease(context: RequestChangeContext, input: unknown) {
    const parsed = releaseChangeSchema.safeParse(input);
    if (!parsed.success) return { error: 'Check the release date, evidence, confirmation, value before release and reason.' };
    const change = parsed.data;
    const fingerprint = { requestId: context.requestId, change };
    return changeRequest(context, {
        fingerprint,
        messages: { invalid: 'Invalid release action.', forbidden: 'You cannot change release in this workspace.', failed: "Couldn't save release. Your input is preserved; try again." },
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
                    insist(change.exposureDate <= utcDay(), 'The release date cannot be in the future.');
                    const earliest = earliestExposure(request);
                    insist(change.exposureDate >= earliest, `The release date cannot be before the Request was created on ${plannedDay(earliest)}.`);
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
export async function readRequestRelease(requestId: string, context: { orgId: string }) {
    return loadRequestRelease(requestId, context);
}
