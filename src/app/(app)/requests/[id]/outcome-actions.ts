'use server';
import { and, asc, eq, inArray } from 'drizzle-orm';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { db, profiles, requests, requestAgreements, requestAgreementEvents } from '@/db';
import { requireActiveMember, requireMemberOrAbove } from '@/lib/auth-guard';
import { agreementRoster } from '@/lib/request-agreement-members';
import { agreementContextSchema, type AgreementContext } from '@/lib/request-agreement';
import { insist, AgreementError, fingerprintOf } from '@/lib/request-agreement-store';
import { notifyReviewers } from '@/lib/request-reviewers';
import { releaseOwner, releaseMeasurement } from '@/lib/request-release';
import { agreedResult, correctableFields, guardrailHeld, isClosed, outcomeChangeSchema, type OutcomeClosure, type OutcomeException } from '@/lib/request-outcome';
import { expectedImpactSchema } from '@/lib/request-impact';
/** The Request's content carried into a follow-up; the follow-up is then reviewed afresh. */
const requestContent = (r: typeof requests.$inferSelect) => ({ title: r.title, description: r.description, classification: r.classification, reframedProblem: r.reframedProblem, extractedSolution: r.extractedSolution, affectedPeople: r.affectedPeople, desiredChange: r.desiredChange, observedEvidence: r.observedEvidence, uncertainty: r.uncertainty, usefulLink: r.usefulLink, requestType: r.requestType, projectId: r.projectId, labelKeys: r.labelKeys, expectedImpact: r.expectedImpact });
const utcToday = () => new Date().toISOString().slice(0, 10);
export async function changeRequestOutcome(context: AgreementContext, input: unknown) {
    try {
        insist(agreementContextSchema.safeParse(context).success, 'Invalid closure action.');
        const parsed = outcomeChangeSchema.safeParse(input);
        insist(parsed.success, 'Check the result, evidence, dates and reason.');
        const change = parsed.data;
        const auth = await requireMemberOrAbove(context.orgId);
        insist(auth, 'You cannot close Requests in this workspace.');
        // Fetch once immediately before locking; Clerk and Postgres cannot share a transaction.
        const people = await agreementRoster(auth.orgId);
        insist(people.some(p => p.nominee.kind === 'member' && p.nominee.userId === auth.userId), 'Your workspace membership is no longer active.');
        const fingerprint = fingerprintOf({ requestId: context.requestId, change });
        const result = await db.transaction(async (tx) => {
            const [request] = await tx.select().from(requests).where(and(eq(requests.id, context.requestId), eq(requests.orgId, auth.orgId))).for('update');
            insist(request, 'Request unavailable.');
            const ownerId = releaseOwner(request);
            const replayed = [request.outcomeClosure, request.exceptionClosure, ...request.closureCorrections]
                .find(entry => entry?.operationId === context.operationId);
            if (replayed) {
                insist(replayed.actorId === auth.userId && replayed.fingerprint === fingerprint, 'This retry key was used for another change.');
                return { success: true as const, revision: replayed.revision };
            }
            insist(ownerId === auth.userId, 'Only the current release and outcome owner can do this.');
            const revision = request.agreementRevision + 1;
            const closedAt = new Date().toISOString();
            if (change.kind === 'correction') {
                insist(isClosed(request), 'Only a Closed Request takes corrections.');
                insist(correctableFields(request.outcomeClosure ? 'measured' : 'exception').includes(change.field), 'Choose a part of this closure to correct.');
                insist(request.agreementRevision === context.expectedRevision, 'Request changed. Reload before trying again.');
                await tx.update(requests).set({ closureCorrections: [...request.closureCorrections, { operationId: context.operationId, fingerprint, actorId: auth.userId, at: closedAt, field: change.field, correction: change.correction, reason: change.reason, revision }], agreementRevision: revision }).where(and(eq(requests.id, request.id), eq(requests.orgId, auth.orgId)));
                return { success: true as const, revision };
            }
            insist(!isClosed(request), 'This Request is permanently closed.');
            insist(request.agreementRevision === context.expectedRevision, 'Request changed. Reload before trying again.');
            const release = request.releaseState?.release ?? null;
            if (change.kind === 'measured') {
                insist(request.status === 'done' && release, 'Record release before closing with a measured result.');
                insist(utcToday() >= release.dueDate, `Measured closure opens on ${release.dueDate} (UTC). If it can’t be measured, close it without a result.`);
                // Content cannot change after pickup, so the Request's Expected impact is the agreed one.
                const expected = expectedImpactSchema.safeParse(request.expectedImpact).data;
                insist(expected, 'The agreed Expected impact is unavailable.');
                const agreed = agreedResult(expected);
                insist(change.primary.kind === agreed.form, agreed.form === 'numeric' ? 'Record the actual value.' : 'Record whether the check passed.');
                insist(change.guardrails.length === agreed.guardrails.length, 'Record an actual value for every agreed guardrail.');
                insist(change.observedFrom <= change.observedTo && change.observedTo <= utcToday(), 'Observation period must end today or earlier and start before it ends.');
                const closure: OutcomeClosure = {
                    version: 1, kind: 'measured', actorId: auth.userId, ownerId, closedAt, operationId: context.operationId, fingerprint,
                    expected, release,
                    primary: change.primary.kind === 'numeric' ? { kind: 'numeric', actual: change.primary.actual, unit: agreed.unit } : change.primary,
                    guardrails: agreed.guardrails.map((g, i) => ({ ...g, actual: change.guardrails[i] })),
                    evidence: change.evidence, observedFrom: change.observedFrom, observedTo: change.observedTo, revision,
                };
                await tx.update(requests).set({ outcomeClosure: closure, agreementRevision: revision }).where(and(eq(requests.id, request.id), eq(requests.orgId, auth.orgId)));
                return { success: true as const, revision };
            }
            if (change.kind === 'exception') {
                insist(request.status !== 'open', 'Nobody has picked this up yet. Delete the Request instead.');
                insist(change.reasonCode !== 'other' || change.reason, 'Say why this is closing without a result.');
                const closure: OutcomeException = { version: 1, kind: 'exception', reasonCode: change.reasonCode, reason: change.reason, actorId: auth.userId, ownerId, closedAt, operationId: context.operationId, fingerprint, release, revision };
                await tx.update(requests).set({ exceptionClosure: closure, agreementRevision: revision }).where(and(eq(requests.id, request.id), eq(requests.orgId, auth.orgId)));
                return { success: true as const, revision };
            }
            throw new AgreementError('Unsupported closure change.');
        });
        revalidatePath('/');
        revalidatePath(`/requests/${context.requestId}`);
        return result;
    }
    catch (error) {
        return { error: error instanceof AgreementError ? error.message : 'Could not save the outcome. Your input is preserved; try again.' };
    }
}
/** New work after release links back without touching the original's measurement obligation. */
export async function createFollowUpRequest(context: AgreementContext, input: unknown) {
    try {
        insist(agreementContextSchema.safeParse(context).success, 'Invalid follow-up action.');
        const parsed = z.object({ reason: z.string().trim().min(1).max(4000) }).strict().safeParse(input);
        insist(parsed.success, 'Explain what changed and why this needs a follow-up.');
        const auth = await requireMemberOrAbove(context.orgId);
        insist(auth, 'You cannot create Requests in this workspace.');
        insist((await agreementRoster(auth.orgId)).some(p => p.nominee.kind === 'member' && p.nominee.userId === auth.userId), 'Your workspace membership is no longer active.');
        const fingerprint = fingerprintOf({ requestId: context.requestId, kind: 'follow_up_created', input: parsed.data });
        const result = await db.transaction(async (tx) => {
            // Locked only to serialise duplicate submissions; the original row is never written.
            const [original] = await tx.select().from(requests).where(and(eq(requests.id, context.requestId), eq(requests.orgId, auth.orgId))).for('update');
            insist(original, 'Request unavailable.');
            const [previous] = await tx.select().from(requestAgreementEvents).where(and(eq(requestAgreementEvents.orgId, auth.orgId), eq(requestAgreementEvents.actorId, auth.userId), eq(requestAgreementEvents.operationId, context.operationId)));
            if (previous) {
                insist(previous.kind === 'follow_up_created' && previous.payload.fingerprint === fingerprint, 'This retry key was used for another change.');
                return previous.payload.result as { success: true; revision: number; followUpId: string };
            }
            const closure = original.outcomeClosure ?? original.exceptionClosure;
            insist(original.releaseState?.release || (closure && 'release' in closure && closure.release), 'Follow-ups start after release.');
            const [follow] = await tx.insert(requests).values({ ...requestContent(original), orgId: auth.orgId, createdBy: auth.userId, measurementDraft: original.measurementDraft, followUpOf: original.id, agreementRevision: 1 }).returning({ id: requests.id });
            const [agreement] = await tx.select().from(requestAgreements).where(and(eq(requestAgreements.requestId, original.id), eq(requestAgreements.orgId, auth.orgId)));
            // Reviewers carry over unanswered, leaving out the creator: approval never carries forward.
            const reviewers = (agreement?.reviewers ?? [])
                .filter(r => !(r.nominee.kind === 'member' && r.nominee.userId === auth.userId))
                .map(r => ({ ...r, id: randomUUID(), addedBy: auth.userId, note: '', decision: null }));
            const [after] = await tx.insert(requestAgreements).values({ orgId: auth.orgId, requestId: follow.id, reviewers }).returning();
            // Each carried-over member is asked to review the follow-up, in the same transaction.
            await notifyReviewers(tx, { id: follow.id, orgId: auth.orgId }, auth.userId, reviewers.flatMap(r => r.nominee.kind === 'member' ? [{ userId: r.nominee.userId, type: 'review_requested' as const, detail: '' }] : []));
            const saved = { success: true as const, revision: 1, followUpId: follow.id };
            await tx.insert(requestAgreementEvents).values({ orgId: auth.orgId, requestId: follow.id, revision: 1, operationId: context.operationId, actorId: auth.userId, kind: 'follow_up_created', payload: { version: 1, fingerprint, input: { ...parsed.data, originalId: original.id }, before: null, after, result: saved } });
            return saved;
        });
        revalidatePath('/');
        revalidatePath(`/requests/${context.requestId}`);
        revalidatePath(`/requests/${result.followUpId}`);
        return result;
    }
    catch (error) {
        return { error: error instanceof AgreementError ? error.message : 'Could not create the follow-up. Your input is preserved; try again.' };
    }
}
export async function readRequestOutcome(requestId: string, context: {
    orgId: string;
}) {
    try {
        insist(z.uuid().safeParse(requestId).success, 'Request unavailable.');
        const auth = await requireActiveMember(context.orgId);
        insist(auth, 'Request unavailable.');
        const [request] = await db.select().from(requests).where(and(eq(requests.id, requestId), eq(requests.orgId, auth.orgId), auth.role === 'guest' ? eq(requests.createdBy, auth.userId) : undefined));
        insist(request, 'Request unavailable.');
        const expected = request.status === 'open' ? null : expectedImpactSchema.safeParse(request.expectedImpact).data ?? null;
        const release = request.releaseState?.release ?? null;
        const ownerId = releaseOwner(request);
        const closure = request.outcomeClosure
            ? { ...request.outcomeClosure, guardrails: request.outcomeClosure.guardrails.map(g => ({ ...g, held: guardrailHeld(g) })) }
            : request.exceptionClosure;
        const ids = [...new Set([ownerId, ...(closure ? [closure.actorId] : []), ...request.closureCorrections.map(c => c.actorId)])];
        const saved = await db.select({ id: profiles.id, name: profiles.fullName }).from(profiles).where(inArray(profiles.id, ids));
        const names: Record<string, string> = Object.fromEntries(ids.map(id => [id, saved.find(p => p.id === id)?.name ?? 'Former member']));
        const measurement = releaseMeasurement(release, new Date());
        let active = false;
        if (auth.role !== 'guest')
            try {
                active = (await agreementRoster(auth.orgId)).some(p => p.nominee.kind === 'member' && p.nominee.userId === auth.userId);
            }
            catch { /* Saved facts remain readable during provider outages; actions stay unavailable. */ }
        const owner = active && ownerId === auth.userId;
        const releasedOnce = release ?? (closure && 'release' in closure ? closure.release : null);
        const guestScope = auth.role === 'guest' ? eq(requests.createdBy, auth.userId) : undefined;
        const followRows = await db.select({ id: requests.id, title: requests.title, requestNumber: requests.requestNumber, createdBy: requests.createdBy, createdAt: requests.createdAt }).from(requests).where(and(eq(requests.orgId, auth.orgId), eq(requests.followUpOf, requestId), guestScope)).orderBy(asc(requests.createdAt), asc(requests.id));
        const reasons = followRows.length ? await db.select({ requestId: requestAgreementEvents.requestId, payload: requestAgreementEvents.payload }).from(requestAgreementEvents).where(and(eq(requestAgreementEvents.orgId, auth.orgId), eq(requestAgreementEvents.kind, 'follow_up_created'), inArray(requestAgreementEvents.requestId, followRows.map(f => f.id)))) : [];
        const parent = request.followUpOf ? (await db.select({ id: requests.id, title: requests.title, requestNumber: requests.requestNumber }).from(requests).where(and(eq(requests.orgId, auth.orgId), eq(requests.id, request.followUpOf), guestScope)))[0] : undefined;
        return {
            requestId, revision: request.agreementRevision, ownerId, names,
            state: closure ? 'closed' as const : release ? 'measuring' as const : 'not_started' as const,
            agreed: expected ? agreedResult(expected) : null,
            release, measurement, closure: closure ?? null, corrections: request.closureCorrections,
            canClose: owner && !closure && request.status === 'done' && !!expected && !!measurement?.due,
            canCloseException: owner && !closure && request.status !== 'open',
            canCorrect: owner && !!closure,
            canFollowUp: active && !!releasedOnce,
            followUpOf: parent ?? null,
            followUps: followRows.map(f => ({ ...f, createdAt: f.createdAt.toISOString(), reason: String((reasons.find(r => r.requestId === f.id)?.payload.input as { reason?: string } | undefined)?.reason ?? '') })),
        };
    }
    catch {
        return { error: 'Could not load the outcome. Try again.' };
    }
}
