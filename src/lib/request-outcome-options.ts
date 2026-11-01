// The outcome's plain choices, with no zod, so the Request page's timeline names them without loading the change
// schemas the server validates with (request-outcome.ts re-exports them).
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
/** Each closure kind only has its own parts to correct. */
export function correctableFields(kind: 'measured' | 'exception'): readonly typeof CORRECTION_FIELDS[number][] {
    return kind === 'measured' ? ['actual', 'guardrails', 'evidence', 'observation', 'learned'] : ['reason', 'learned'];
}
