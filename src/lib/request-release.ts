import { z } from 'zod';
import type { ExpectedImpact } from './request-impact';
const text = z.string().trim().min(1).max(4000);
export const releaseDateSchema = z.iso.date();
const facts = { exposureDate: releaseDateSchema, evidence: text, audienceConfirmed: z.literal(true) };
export const releaseChangeSchema = z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('release'), ...facts }).strict(),
    z.object({ kind: z.literal('correct'), ...facts, reason: text }).strict(),
    z.object({ kind: z.literal('void'), reason: text, neverExposed: z.literal(true) }).strict(),
    z.object({ kind: z.literal('transfer'), recipientId: z.string().min(1).max(200), reason: text }).strict(),
]);
export type ReleaseChange = z.infer<typeof releaseChangeSchema>;
export type ReleaseFact = {
    exposureDate: string;
    audience: string;
    evidence: string;
    dueDate: string;
    startDate: string;
    windowKind: 'fixed' | 'relative';
};
export type ReleaseEvent = {
    operationId: string;
    fingerprint: string;
    actorId: string;
    at: string;
    input: ReleaseChange;
    previousRelease: ReleaseFact | null;
    release: ReleaseFact | null;
    previousOwnerId: string;
    ownerId: string;
    revision: number;
};
export type ReleaseState = {
    version: 1;
    ownerId: string;
    release: ReleaseFact | null;
    history: ReleaseEvent[];
};
/** Shared owner contract for release and ticket #60 closure. Authorship never changes. */
export function releaseOwner(request: {
    createdBy: string;
    releaseState?: ReleaseState | null;
}) {
    return request.releaseState?.ownerId ?? request.createdBy;
}
export function releaseWindow(impact: ExpectedImpact | null, exposureDate: string): Pick<ReleaseFact, 'dueDate' | 'startDate' | 'windowKind'> {
    if (!impact)
        throw new Error('A complete agreed measurement window is required.');
    if (impact.measurement?.exactDates) {
        return { startDate: releaseDateSchema.parse(impact.measurement.startDate), dueDate: releaseDateSchema.parse(impact.measurement.endDate), windowKind: 'fixed' };
    }
    const days = impact.kind === 'measurement' ? impact.measurement.windowDays : impact.reviewAfterDays;
    if (!Number.isInteger(days) || days <= 0)
        throw new Error('A complete agreed measurement window is required.');
    const date = new Date(exposureDate + 'T00:00:00.000Z');
    date.setUTCDate(date.getUTCDate() + days);
    return { startDate: exposureDate, dueDate: date.toISOString().slice(0, 10), windowKind: 'relative' };
}
export function releaseMeasurement(release: ReleaseFact | null, now: Date) {
    if (!release)
        return null;
    const today = now.toISOString().slice(0, 10);
    const days = Math.round((Date.parse(release.dueDate + 'T00:00:00Z') - Date.parse(today + 'T00:00:00Z')) / 86400000);
    return { due: days <= 0, days, label: days === 0 ? 'Due today' : days > 0 ? `${days} day${days === 1 ? '' : 's'} remaining` : `${-days} day${days === -1 ? '' : 's'} overdue` };
}
