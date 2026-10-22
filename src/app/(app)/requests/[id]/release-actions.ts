'use server';
import { and, eq, inArray } from 'drizzle-orm';
import { z } from 'zod';
import { db, profiles, requests } from '@/db';
import { requireActiveMember } from '@/lib/auth-guard';
import { workspaceRoster } from '@/lib/workspace-roster';
import type { RequestChangeContext } from '@/lib/request-reviewer-rules';
import { changeRequest, insist } from '@/lib/request-change-store';
import { isClosed } from '@/lib/request-outcome';
import { expectedImpactSchema } from '@/lib/request-impact';
/** The Request is what was agreed, so its "Users" are the agreed audience. */
const agreedAudience = (request: { affectedPeople: string | null }) => request.affectedPeople?.trim() || 'Everyone this Request is for';
import { releaseChangeSchema, releaseOwner, releaseWindow, releaseMeasurement, earliestExposure, type ReleaseState } from '@/lib/request-release';
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
        apply: async (_tx, { request, auth, roster, revision, fingerprint }) => {
            const member = (id: string) => roster.find(p => p.nominee.kind === 'member' && p.nominee.userId === id);
            const ownerId = releaseOwner(request);
            const isTransfer = change.kind === 'transfer';
            insist(isTransfer ? auth.role === 'admin' && member(auth.userId)?.role === 'org:admin' : ownerId === auth.userId, isTransfer ? 'Only a workspace admin can transfer responsibility.' : 'Only the current release and outcome owner can do this.');
            insist(!isClosed(request) || isTransfer, 'This Request is permanently closed.');
            const state: ReleaseState = request.releaseState ?? { version: 1, ownerId, release: null, history: [] };
            const before = state.release;
            let nextOwner = ownerId;
            let nextRelease = before;
            if (change.kind === 'transfer') {
                insist(!member(ownerId), 'The current owner still has active workspace access.');
                insist(member(change.recipientId), 'Choose an active non-guest workspace member.');
                nextOwner = change.recipientId;
            }
            else {
                insist(request.status === 'done', 'Work must be Done before recording release.');
                if (change.kind === 'void') {
                    insist(before, 'There is no release to void.');
                    nextRelease = null;
                }
                else {
                    insist(change.kind === 'correct' ? before : !before, change.kind === 'correct' ? 'There is no release to correct.' : 'Release is already recorded. Reload to view it.');
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
        const [request] = await db.select().from(requests).where(and(eq(requests.id, requestId), eq(requests.orgId, auth.orgId), auth.role === 'guest' ? eq(requests.createdBy, auth.userId) : undefined));
        insist(request, 'Request unavailable.');
        const ownerId = releaseOwner(request);
        let people: Awaited<ReturnType<typeof workspaceRoster>> = [];
        let membershipAvailable = false;
        if (auth.role !== 'guest') {
            try {
                people = await workspaceRoster(auth.orgId);
                membershipAvailable = true;
            }
            catch { /* Saved facts remain readable during provider outages. */ }
        }
        const active = (id: string) => people.some(p => p.nominee.kind === 'member' && p.nominee.userId === id);
        const canEdit = auth.role !== 'guest' && active(auth.userId) && ownerId === auth.userId && !isClosed(request);
        const release = request.releaseState?.release ?? null;
        const history = request.releaseState?.history ?? [];
        // Saved profile names cover departed owners and guests, who receive no fresh roster.
        const ids = [...new Set([ownerId, ...history.flatMap(e => [e.actorId, e.previousOwnerId, e.ownerId])])];
        const saved = await db.select({ id: profiles.id, name: profiles.fullName }).from(profiles).where(inArray(profiles.id, ids));
        const names: Record<string, string> = Object.fromEntries(ids.map(id => [id, people.find(p => p.nominee.kind === 'member' && p.nominee.userId === id)?.name ?? saved.find(p => p.id === id)?.name ?? 'Former member']));
        const now = new Date();
        return {
            requestId, revision: request.agreementRevision, ownerId, done: request.status === 'done',
            ownerName: names[ownerId], names,
            release, measurement: releaseMeasurement(release, now), today: now.toISOString().slice(0, 10),
            audience: agreedAudience(request),
            earliestExposure: earliestExposure(request),
            canRelease: canEdit && request.status === 'done' && !release,
            canCorrect: canEdit && request.status === 'done' && !!release,
            canTransfer: auth.role === 'admin' && people.some(p => p.nominee.kind === 'member' && p.nominee.userId === auth.userId && p.role === 'org:admin') && membershipAvailable && !active(ownerId),
            people: auth.role === 'admin' ? people.flatMap(p => p.nominee.kind === 'member' ? [{ id: p.nominee.userId, name: p.name }] : []) : [],
            blocked: request.status !== 'done' ? 'Complete work before recording release.' : null,
            history: history.map(event => ({ actorId: event.actorId, at: event.at, input: event.input, previousRelease: event.previousRelease, release: event.release, previousOwnerId: event.previousOwnerId, ownerId: event.ownerId, revision: event.revision })),
        };
    }
    catch {
        return { error: 'Could not load release. Try again.' };
    }
}
