'use server';
import { and, eq, inArray } from 'drizzle-orm';
import { z } from 'zod';
import { db, profiles, requests } from '@/db';
import { requireActiveMember } from '@/lib/auth-guard';
import { workspaceRoster } from '@/lib/workspace-roster';
import type { RequestChangeContext } from '@/lib/request-reviewer-rules';
import { changeRequest, insist } from '@/lib/request-change-store';
import { seeable } from '@/lib/request-access';
import { expectedImpactSchema } from '@/lib/request-impact';
/** The Request is what was agreed, so its "Users" are the agreed audience. */
const agreedAudience = (request: { affectedPeople: string | null }) => request.affectedPeople?.trim() || 'Everyone this Request is for';
import { releaseChangeSchema, releaseWindow, releaseMeasurement, earliestExposure, type ReleaseState } from '@/lib/request-release';
import { journeyStatus, requesterOf } from '@/lib/request-journey';
import { allow, journeyActionsFor, personName } from '@/lib/request-journey-access';
const JOURNEY_ACTION = { release: 'release', correct: 'correctRelease', void: 'voidRelease', transfer: 'handover' } as const;
export async function changeRequestRelease(context: RequestChangeContext, input: unknown) {
    const parsed = releaseChangeSchema.safeParse(input);
    if (!parsed.success) return { error: 'Check the exposure date, evidence, confirmation and reason.' };
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
            const ownerId = requesterOf(request);
            // Release, correct and void: any active member while Done or Measuring. Handover: an admin, from pickup, once the Requester has lost access.
            const actions = journeyActionsFor(request, auth, roster, await personName(tx, roster, ownerId), new Date());
            allow(actions[JOURNEY_ACTION[change.kind]]);
            // Before any release, a handover starts the release record with no release.
            const state: ReleaseState = request.releaseState ?? { version: 1, ownerId, release: null, history: [] };
            const before = state.release;
            let nextOwner = ownerId;
            let nextRelease = before;
            if (change.kind === 'transfer') {
                insist(roster.some(p => p.nominee.kind === 'member' && p.nominee.userId === change.recipientId), 'Choose an active non-guest workspace member.');
                nextOwner = change.recipientId;
            }
            else {
                if (change.kind === 'void') {
                    nextRelease = null;
                }
                else {
                    insist(change.exposureDate <= new Date().toISOString().slice(0, 10), 'Exposure cannot be in the future.');
                    const earliest = earliestExposure(request);
                    insist(change.exposureDate >= earliest, `Exposure cannot be before the Request was created on ${earliest} (UTC).`);
                    nextRelease = { exposureDate: change.exposureDate, evidence: change.evidence, audience: agreedAudience(request), ...releaseWindow(expectedImpactSchema.safeParse(request.expectedImpact).data ?? null, change.exposureDate) };
                }
            }
            const next: ReleaseState = { version: 1, ownerId: nextOwner, release: nextRelease, history: [...state.history, { operationId: context.operationId, fingerprint, actorId: auth.userId, at: new Date().toISOString(), input: change, previousRelease: before, release: nextRelease, previousOwnerId: ownerId, ownerId: nextOwner, revision }] };
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
        const ids = [...new Set([requesterId, ...history.flatMap(e => [e.actorId, e.previousOwnerId, e.ownerId])])];
        const saved = await db.select({ id: profiles.id, name: profiles.fullName }).from(profiles).where(inArray(profiles.id, ids));
        const names: Record<string, string> = Object.fromEntries(ids.map(id => [id, people.find(p => p.nominee.kind === 'member' && p.nominee.userId === id)?.name ?? saved.find(p => p.id === id)?.name ?? 'Former member']));
        const now = new Date();
        // Every journey action with its reason, from the same rules the actions refuse with.
        const actions = journeyActionsFor(request, auth, roster, names[requesterId], now);
        return {
            requestId, revision: request.agreementRevision, requesterId, requesterName: names[requesterId], names,
            journey: journeyStatus(request), actions, done: request.status === 'done',
            release, measurement: releaseMeasurement(release, now), today: now.toISOString().slice(0, 10),
            audience: agreedAudience(request),
            earliestExposure: earliestExposure(request),
            canRelease: actions.release.allowed,
            canCorrect: actions.correctRelease.allowed,
            canTransfer: actions.handover.allowed,
            people: auth.role === 'admin' ? people.flatMap(p => p.nominee.kind === 'member' ? [{ id: p.nominee.userId, name: p.name }] : []) : [],
            blocked: request.status !== 'done' ? 'Complete work before recording release.' : null,
            history: history.map(event => ({ actorId: event.actorId, at: event.at, input: event.input, previousRelease: event.previousRelease, release: event.release, previousOwnerId: event.previousOwnerId, ownerId: event.ownerId, revision: event.revision })),
        };
    }
    catch {
        return { error: 'Could not load release. Try again.' };
    }
}
