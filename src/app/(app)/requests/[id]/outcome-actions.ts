'use server';
import { loadRequestOutcome } from '@/lib/data/request-journey';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { requests, requestAgreements, requestAgreementEvents } from '@/db';
import type { RequestChangeContext } from '@/lib/request-reviewer-rules';
import { changeRequest, insist } from '@/lib/request-change-store';
import { notifyReviewers } from '@/lib/request-reviewers';
import { requesterOf } from '@/lib/request-journey';
import { allow, journeyActionsFor, personName } from '@/lib/request-journey-access';
import { agreedResult, correctableFields, outcomeChangeSchema, type OutcomeClosure, type OutcomeException } from '@/lib/request-outcome';
import { expectedImpactSchema } from '@/lib/request-impact';
import { utcDay } from '@/lib/utc-day';
/** Each closure change and the journey action that allows it. */
const JOURNEY_ACTION = { measured: 'close', exception: 'closeWithoutResult', correction: 'correctClosure' } as const;
/** The Request's content carried into a follow-up; the follow-up is then reviewed afresh. */
const requestContent = (r: typeof requests.$inferSelect) => ({ title: r.title, description: r.description, classification: r.classification, reframedProblem: r.reframedProblem, extractedSolution: r.extractedSolution, affectedPeople: r.affectedPeople, desiredChange: r.desiredChange, observedEvidence: r.observedEvidence, uncertainty: r.uncertainty, usefulLink: r.usefulLink, requestType: r.requestType, projectId: r.projectId, labelKeys: r.labelKeys, expectedImpact: r.expectedImpact });
export async function changeRequestOutcome(context: RequestChangeContext, input: unknown) {
    const parsed = outcomeChangeSchema.safeParse(input);
    if (!parsed.success) return { error: 'Check the result, evidence, dates and reason.' };
    const change = parsed.data;
    return changeRequest(context, {
        fingerprint: { requestId: context.requestId, change },
        messages: { invalid: 'Invalid closure action.', forbidden: 'You cannot close Requests in this workspace.', failed: 'Could not save the outcome. Your input is preserved; try again.' },
        // A closure and each correction record their operation, which is how a retry replays.
        replayOf: (_tx, request) => {
            const previous = [request.outcomeClosure, request.exceptionClosure, ...request.closureCorrections].find(entry => entry?.operationId === context.operationId);
            return previous ? { actorId: previous.actorId, fingerprint: previous.fingerprint, result: { success: true as const, revision: previous.revision } } : undefined;
        },
        apply: async (tx, { request, auth, roster, revision, fingerprint }) => {
            const requesterId = requesterOf(request);
            // Closing, closing without a result and corrections stay with the Requester.
            const now = new Date();
            const actions = journeyActionsFor(request, auth, roster, await personName(tx, roster, requesterId), now);
            allow(actions[JOURNEY_ACTION[change.kind]]);
            const closedAt = now.toISOString();
            if (change.kind === 'correction') {
                insist(correctableFields(request.outcomeClosure ? 'measured' : 'exception').includes(change.field), 'Choose a part of this closure to correct.');
                return { set: { closureCorrections: [...request.closureCorrections, { operationId: context.operationId, fingerprint, actorId: auth.userId, at: closedAt, field: change.field, correction: change.correction, reason: change.reason, revision }] } };
            }
            const release = request.releaseState?.release ?? null;
            if (change.kind === 'measured') {
                insist(release, 'Record release before closing with a measured result.');
                // Content cannot change after pickup, so the Request's Expected impact is the agreed one.
                const expected = expectedImpactSchema.safeParse(request.expectedImpact).data;
                insist(expected, 'The agreed Expected impact is unavailable.');
                const agreed = agreedResult(expected);
                insist(change.primary.kind === agreed.form, agreed.form === 'numeric' ? 'Record the actual value.' : 'Record whether the check passed.');
                insist(change.guardrails.length === agreed.guardrails.length, 'Record an actual value for every agreed guardrail.');
                insist(change.observedFrom <= change.observedTo && change.observedTo <= utcDay(), 'Observation period must end today or earlier and start before it ends.');
                const closure: OutcomeClosure = {
                    version: 1, kind: 'measured', actorId: auth.userId, ownerId: requesterId, closedAt, operationId: context.operationId, fingerprint,
                    expected, release,
                    primary: change.primary.kind === 'numeric' ? { kind: 'numeric', actual: change.primary.actual, unit: agreed.unit } : change.primary,
                    guardrails: agreed.guardrails.map((g, i) => ({ ...g, actual: change.guardrails[i] })),
                    evidence: change.evidence, observedFrom: change.observedFrom, observedTo: change.observedTo, revision,
                };
                return { set: { outcomeClosure: closure } };
            }
            insist(change.reasonCode !== 'other' || change.reason, 'Say why this is closing without a result.');
            const closure: OutcomeException = { version: 1, kind: 'exception', reasonCode: change.reasonCode, reason: change.reason, actorId: auth.userId, ownerId: requesterId, closedAt, operationId: context.operationId, fingerprint, release, revision };
            return { set: { exceptionClosure: closure } };
        },
    });
}
/** New work after release links back without touching the original's measurement obligation. */
export async function createFollowUpRequest(context: RequestChangeContext, input: unknown) {
    const parsed = z.object({ reason: z.string().trim().min(1).max(4000) }).strict().safeParse(input);
    if (!parsed.success) return { error: 'Explain what changed and why this needs a follow-up.' };
    const result = await changeRequest<{ followUpId: string }>(context, {
        fingerprint: { requestId: context.requestId, kind: 'follow_up_created', input: parsed.data },
        messages: { invalid: 'Invalid follow-up action.', forbidden: 'You cannot create Requests in this workspace.', failed: 'Could not create the follow-up. Your input is preserved; try again.' },
        // The original is locked only to serialise duplicate submissions and is never written.
        revises: false,
        replayOf: async (tx, _original, auth) => {
            const [previous] = await tx.select().from(requestAgreementEvents).where(and(eq(requestAgreementEvents.orgId, auth.orgId), eq(requestAgreementEvents.actorId, auth.userId), eq(requestAgreementEvents.operationId, context.operationId)));
            if (!previous) return undefined;
            // Another kind of change under this key can never match: its fingerprint names its own kind.
            return { actorId: previous.actorId, fingerprint: previous.kind === 'follow_up_created' ? previous.payload.fingerprint : '', result: previous.payload.result as { success: true; revision: number; followUpId: string } };
        },
        apply: async (tx, { request: original, auth, roster, fingerprint }) => {
            allow(journeyActionsFor(original, auth, roster, await personName(tx, roster, requesterOf(original)), new Date()).followUp);
            const [follow] = await tx.insert(requests).values({ ...requestContent(original), orgId: auth.orgId, createdBy: auth.userId, measurementDraft: original.measurementDraft, followUpOf: original.id, agreementRevision: 1 }).returning({ id: requests.id });
            const [reviewersRow] = await tx.select().from(requestAgreements).where(and(eq(requestAgreements.requestId, original.id), eq(requestAgreements.orgId, auth.orgId)));
            // Reviewers carry over unanswered, leaving out the creator: approval never carries forward.
            const reviewers = (reviewersRow?.reviewers ?? [])
                .filter(r => !(r.nominee.kind === 'member' && r.nominee.userId === auth.userId))
                .map(r => ({ ...r, id: randomUUID(), addedBy: auth.userId, note: '', decision: null }));
            const [after] = await tx.insert(requestAgreements).values({ orgId: auth.orgId, requestId: follow.id, reviewers }).returning();
            // Each carried-over member is asked to review the follow-up, in the same transaction.
            await notifyReviewers(tx, { id: follow.id, orgId: auth.orgId }, auth.userId, reviewers.flatMap(r => r.nominee.kind === 'member' ? [{ userId: r.nominee.userId, type: 'review_requested' as const, detail: '' }] : []));
            const saved = { success: true as const, revision: 1, followUpId: follow.id };
            await tx.insert(requestAgreementEvents).values({ orgId: auth.orgId, requestId: follow.id, revision: 1, operationId: context.operationId, actorId: auth.userId, kind: 'follow_up_created', payload: { version: 1, fingerprint, input: { ...parsed.data, originalId: original.id }, before: null, after, result: saved } });
            return { result: { revision: 1, followUpId: follow.id } };
        },
    });
    if ('followUpId' in result) revalidatePath(`/requests/${result.followUpId}`);
    return result;
}
export async function readRequestOutcome(requestId: string, context: { orgId: string }) {
    return loadRequestOutcome(requestId, context);
}
