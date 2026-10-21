'use server';
import { and, eq, inArray } from 'drizzle-orm';
import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { db, profiles, requests } from '@/db';
import { requireActiveMember, requireMemberOrAbove } from '@/lib/auth-guard';
import { agreementRoster } from '@/lib/request-agreement-members';
import { agreementContextSchema, type AgreementContext } from '@/lib/request-agreement';
import { insist, AgreementError, fingerprintOf } from '@/lib/request-agreement-store';
import { isClosed } from '@/lib/request-outcome';
import { expectedImpactSchema } from '@/lib/request-impact';
/** The Request is what was agreed, so its "Users" are the agreed audience. */
const agreedAudience = (request: { affectedPeople: string | null }) => request.affectedPeople?.trim() || 'Everyone this Request is for';
import { releaseChangeSchema, releaseOwner, releaseWindow, releaseMeasurement, earliestExposure, type ReleaseState } from '@/lib/request-release';
export async function changeRequestRelease(context: AgreementContext, input: unknown) {
    try {
        insist(agreementContextSchema.safeParse(context).success, 'Invalid release action.');
        const parsed = releaseChangeSchema.safeParse(input);
        insist(parsed.success, 'Check the exposure date, evidence, confirmation and reason.');
        const change = parsed.data;
        const auth = await requireMemberOrAbove(context.orgId);
        insist(auth, 'You cannot change release in this workspace.');
        // Fetch once immediately before locking; Clerk and Postgres cannot share a transaction.
        const people = await agreementRoster(auth.orgId);
        const member = (id: string) => people.find(p => p.nominee.kind === 'member' && p.nominee.userId === id);
        insist(member(auth.userId), 'Your workspace membership is no longer active.');
        const fingerprint = fingerprintOf({ requestId: context.requestId, change });
        const result = await db.transaction(async (tx) => {
            const [request] = await tx.select().from(requests).where(and(eq(requests.id, context.requestId), eq(requests.orgId, auth.orgId))).for('update');
            insist(request, 'Request unavailable.');
            const ownerId = releaseOwner(request);
            const isTransfer = change.kind === 'transfer';
            insist(isTransfer ? auth.role === 'admin' && member(auth.userId)?.role === 'org:admin' : ownerId === auth.userId, isTransfer ? 'Only a workspace admin can transfer responsibility.' : 'Only the current release and outcome owner can do this.');
            const state: ReleaseState = request.releaseState ?? { version: 1, ownerId, release: null, history: [] };
            const previous = state.history.find(e => e.operationId === context.operationId);
            if (previous) {
                insist(previous.actorId === auth.userId && previous.fingerprint === fingerprint, 'This retry key was used for another change.');
                return { success: true as const, revision: previous.revision };
            }
            insist(!isClosed(request) || change.kind === 'transfer', 'This Request is permanently closed.');
            insist(request.agreementRevision === context.expectedRevision, 'Request changed. Reload before trying again.');
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
            const revision = request.agreementRevision + 1;
            const next: ReleaseState = { version: 1, ownerId: nextOwner, release: nextRelease, history: [...state.history, { operationId: context.operationId, fingerprint, actorId: auth.userId, at: new Date().toISOString(), input: change, previousRelease: before, release: nextRelease, previousOwnerId: ownerId, ownerId: nextOwner, revision }] };
            await tx.update(requests).set({ releaseState: next, agreementRevision: revision }).where(and(eq(requests.id, request.id), eq(requests.orgId, auth.orgId)));
            return { success: true as const, revision };
        });
        revalidatePath('/');
        revalidatePath(`/requests/${context.requestId}`);
        return result;
    }
    catch (error) {
        return { error: error instanceof AgreementError ? error.message : 'Could not save release. Your input is preserved; try again.' };
    }
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
        let people: Awaited<ReturnType<typeof agreementRoster>> = [];
        let membershipAvailable = false;
        if (auth.role !== 'guest') {
            try {
                people = await agreementRoster(auth.orgId);
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
