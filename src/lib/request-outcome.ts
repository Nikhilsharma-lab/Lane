import { z } from 'zod';
import type { GuardrailOperator } from './guardrail-comparison';
import type { ExpectedImpact } from './request-impact';
import { measurementMetricLabel, measurementUnitLabel } from './request-measurement';
import type { ReleaseFact } from './request-release';
const text = z.string().trim().min(1).max(4000);
const date = z.iso.date();
/** Why picked-up work ends without a measured result. Before pickup, the requester deletes instead. */
export const EXCEPTION_REASONS = ['rolled_back', 'cannot_measure', 'other'] as const;
export type ExceptionReason = typeof EXCEPTION_REASONS[number];
export const EXCEPTION_REASON_OPTIONS: { value: ExceptionReason; label: string }[] = [
    { value: 'rolled_back', label: 'Rolled back' },
    { value: 'cannot_measure', label: 'Can’t be measured' },
    { value: 'other', label: 'Other' },
];
export const CORRECTION_FIELDS = ['actual', 'guardrails', 'evidence', 'observation', 'reason', 'learned'] as const;
export const CORRECTION_FIELD_OPTIONS: { value: typeof CORRECTION_FIELDS[number]; label: string }[] = [
    { value: 'actual', label: 'Actual result' }, { value: 'guardrails', label: 'Guardrails' },
    { value: 'evidence', label: 'Evidence' }, { value: 'observation', label: 'Observation period' },
    { value: 'reason', label: 'Reason' },
    { value: 'learned', label: 'What we learned' },
];
/** What we learned (#209): one line, at most this long. The database refuses anything else (migration 0043). */
export const LEARNED_MAX_LENGTH = 280;
const ONE_LINE = /^[^\r\n]*$/;
/** Optional on closing: trimmed, one line; left blank, nothing is stored. */
const learnedLine = z.string().trim().max(LEARNED_MAX_LENGTH).regex(ONE_LINE).optional().transform(value => value || undefined);
export const outcomeChangeSchema = z.discriminatedUnion('kind', [
    z.object({
        kind: z.literal('measured'),
        primary: z.discriminatedUnion('kind', [
            z.object({ kind: z.literal('numeric'), actual: z.number().finite() }).strict(),
            z.object({ kind: z.literal('pass_fail'), passed: z.boolean() }).strict(),
        ]),
        // Actual values in the agreed guardrail order; every agreed guardrail needs one.
        guardrails: z.array(z.number().finite()).max(20),
        evidence: text, observedFrom: date, observedTo: date,
        learned: learnedLine,
    }).strict(),
    z.object({ kind: z.literal('exception'), reasonCode: z.enum(EXCEPTION_REASONS), reason: z.string().trim().max(4000), learned: learnedLine }).strict(),
    z.object({ kind: z.literal('correction'), field: z.enum(CORRECTION_FIELDS), correction: text, reason: text }).strict()
        // A Correction of What we learned is one line, like the original.
        .refine(change => change.field !== 'learned' || (change.correction.length <= LEARNED_MAX_LENGTH && ONE_LINE.test(change.correction))),
]);
/** Each closure kind only has its own parts to correct. */
export function correctableFields(kind: 'measured' | 'exception'): readonly typeof CORRECTION_FIELDS[number][] {
    return kind === 'measured' ? ['actual', 'guardrails', 'evidence', 'observation', 'learned'] : ['reason', 'learned'];
}
/** A closure change as a form sends it (before trimming). */
export type OutcomeChange = z.input<typeof outcomeChangeSchema>;
export type AgreedGuardrail = { metric: string; operator: GuardrailOperator; limit: number; unit: string };
export type OutcomeClosure = {
    version: 1;
    kind: 'measured';
    actorId: string;
    ownerId: string;
    closedAt: string;
    operationId: string;
    fingerprint: string;
    expected: ExpectedImpact;
    release: ReleaseFact;
    primary: { kind: 'numeric'; actual: number; unit: string } | { kind: 'pass_fail'; passed: boolean };
    guardrails: (AgreedGuardrail & { actual: number })[];
    evidence: string;
    observedFrom: string;
    observedTo: string;
    /** What we learned (#209), when the Requester gave one. Never rewritten; a Correction changes it. */
    learned?: string;
    revision: number;
};
export type OutcomeException = {
    version: 1;
    kind: 'exception';
    reasonCode: ExceptionReason;
    reason: string;
    actorId: string;
    ownerId: string;
    closedAt: string;
    operationId: string;
    fingerprint: string;
    release: ReleaseFact | null;
    /** What we learned (#209), when the Requester gave one. Never rewritten; a Correction changes it. */
    learned?: string;
    revision: number;
};
export type ClosureCorrection = {
    operationId: string;
    fingerprint: string;
    actorId: string;
    at: string;
    field: typeof CORRECTION_FIELDS[number];
    correction: string;
    reason: string;
    revision: number;
};
export type AgreedResult = {
    form: 'numeric' | 'pass_fail';
    label: string;
    unit: string;
    baseline: number | null;
    target: number | null;
    guardrails: AgreedGuardrail[];
};
/** The agreed expectation in the shape the closure form records against, for every saved impact version. */
export function agreedResult(impact: ExpectedImpact): AgreedResult {
    if (impact.kind === 'measurement') {
        const { primary } = impact;
        // Saved plans always carry a limit; never invent one for an incomplete legacy guardrail.
        const guardrails = impact.guardrails.flatMap(g => g.limit === null ? [] : [{ metric: measurementMetricLabel(g), operator: g.operator, limit: g.limit, unit: measurementUnitLabel(g.unit) }]);
        if (primary.key === 'check')
            return { form: 'pass_fail', label: measurementMetricLabel(primary), unit: '', baseline: null, target: null, guardrails };
        return { form: 'numeric', label: measurementMetricLabel(primary), unit: measurementUnitLabel(primary.unit), baseline: primary.noBaseline ? null : primary.current, target: primary.target, guardrails };
    }
    const guardrails = [impact.guardrail, ...(impact.additionalGuardrails ?? [])].flatMap(g => g ? [{ metric: g.metric, operator: g.operator, limit: g.limit, unit: g.unit }] : []);
    if (impact.kind === 'metric')
        return { form: 'numeric', label: impact.metric, unit: impact.unit, baseline: impact.baseline, target: impact.target, guardrails };
    return { form: 'pass_fail', label: impact.result, unit: '', baseline: null, target: null, guardrails };
}
export function guardrailHeld(guardrail: AgreedGuardrail & { actual: number }) {
    const { actual, limit } = guardrail;
    return { less_than: actual < limit, greater_than: actual > limit, equal_to: actual === limit, at_most: actual <= limit, at_least: actual >= limit }[guardrail.operator];
}
/** Detail lifecycle label for a terminal Request; the work status column never changes. */
export function closureLabel(request: { exceptionClosure?: unknown; outcomeClosure?: unknown }) {
    if (request.outcomeClosure)
        return 'Closed';
    return request.exceptionClosure ? 'Closed without a result' : null;
}
export function isClosed(request: { exceptionClosure?: unknown; outcomeClosure?: unknown }) {
    return Boolean(request.exceptionClosure || request.outcomeClosure);
}
