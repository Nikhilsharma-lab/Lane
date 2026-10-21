import { z } from 'zod';
import type { GuardrailOperator } from './guardrail-comparison';
import type { ExpectedImpact } from './request-impact';
import { measurementMetricLabel, measurementUnitLabel } from './request-measurement';
import type { ReleaseFact } from './request-release';
const text = z.string().trim().min(1).max(4000);
const date = z.iso.date();
export const EXCEPTION_REASONS = ['cancelled', 'rolled_back', 'measurement_unavailable', 'inconclusive'] as const;
export type ExceptionReason = typeof EXCEPTION_REASONS[number];
export const EXCEPTION_REASON_OPTIONS: { value: ExceptionReason; label: string }[] = [
    { value: 'cancelled', label: 'Not launched or cancelled' },
    { value: 'rolled_back', label: 'Rolled back' },
    { value: 'measurement_unavailable', label: 'Measurement unavailable' },
    { value: 'inconclusive', label: 'Inconclusive result' },
];
export const CORRECTION_FIELDS = ['actual', 'guardrails', 'evidence', 'observation', 'reason'] as const;
export const CORRECTION_FIELD_OPTIONS: { value: typeof CORRECTION_FIELDS[number]; label: string }[] = [
    { value: 'actual', label: 'Actual result' }, { value: 'guardrails', label: 'Guardrails' },
    { value: 'evidence', label: 'Evidence' }, { value: 'observation', label: 'Observation period' },
    { value: 'reason', label: 'Exception reason' },
];
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
    }).strict(),
    z.object({ kind: z.literal('exception'), reasonCode: z.enum(EXCEPTION_REASONS), reason: text }).strict(),
    z.object({ kind: z.literal('correction'), field: z.enum(CORRECTION_FIELDS), correction: text, reason: text }).strict(),
]);
/** Each closure kind only has its own parts to correct. */
export function correctableFields(kind: 'measured' | 'exception'): readonly typeof CORRECTION_FIELDS[number][] {
    return kind === 'measured' ? ['actual', 'guardrails', 'evidence', 'observation'] : ['reason'];
}
export type OutcomeChange = z.infer<typeof outcomeChangeSchema>;
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
    revision: number;
};
export type OutcomeException = {
    version: 2;
    kind: 'exception';
    reasonCode: ExceptionReason;
    reason: string;
    actorId: string;
    ownerId: string;
    closedAt: string;
    operationId: string;
    fingerprint: string;
    release: ReleaseFact | null;
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
export function closureLabel(request: { exceptionClosure?: { reasonCode: string } | null; outcomeClosure?: unknown }) {
    if (request.outcomeClosure)
        return 'Closed';
    if (!request.exceptionClosure)
        return null;
    return request.exceptionClosure.reasonCode === 'superseded' ? 'Superseded' : 'Closed with exception';
}
export function isSuperseded(request: { exceptionClosure?: { reasonCode: string } | null }) {
    return request.exceptionClosure?.reasonCode === 'superseded';
}
export function isClosed(request: { exceptionClosure?: unknown; outcomeClosure?: unknown }) {
    return Boolean(request.exceptionClosure || request.outcomeClosure);
}
