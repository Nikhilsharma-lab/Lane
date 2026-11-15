import * as z from 'zod';
import type { ExpectedImpact } from './request-impact';
import { agreedResult } from './request-outcome';
import { dayNumber, dayOf, utcDay } from './utc-day';
const text = z.string().trim().min(1).max(4000);
export const releaseDateSchema = z.iso.date();
/** The measured value just before release, in the agreed metric's unit (#151 decision 3). Required for a measured plan. */
export const valueBeforeReleaseSchema = z.object({ value: z.number(), unit: z.string().trim().min(1).max(40) }).strict();
const facts = { exposureDate: releaseDateSchema, evidence: text, audienceConfirmed: z.literal(true), valueBeforeRelease: valueBeforeReleaseSchema.optional() };
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
// The zod-free reads live apart so the list, the shell and the journey module load without zod (#133).
export { dueWords, releaseMeasurement, requesterOf } from './request-release-facts';
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
    return { startDate: exposureDate, dueDate: utcDay(date), windowKind: 'relative' };
}
/**
 * Whether a release must record the value before release: a numeric result whose plan has a planning baseline.
 * A Verified check, a new capability and an unknown baseline never take one (#151 decision 3).
 */
export function valueBeforeReleaseOf(impact: ExpectedImpact | null): { required: true; unit: string; current: number } | { required: false; unit: null } {
    if (!impact) return { required: false, unit: null };
    const agreed = agreedResult(impact);
    if (agreed.form !== 'numeric') return { required: false, unit: null };
    const planned = impact.kind === 'measurement' ? !impact.primary.noBaseline && impact.primary.current !== null : impact.kind === 'metric' && impact.noBaseline !== true && agreed.baseline !== null;
    // `current`: the goal's current value, where the release form starts (#277).
    return planned && agreed.baseline !== null ? { required: true, unit: agreed.unit, current: agreed.baseline } : { required: false, unit: null };
}

/**
 * #277 (#235 item 8): the days a release can be recorded on. The earliest is the day the work was picked up, or the day
 * the Request was filed for older work with no pickup time; the latest is today. The person picks a day in their own
 * time zone while pickup and today are counted in UTC, so the server allows one day either side: a valid local choice is
 * never refused. A correction may keep the date already saved, which an older rule allowed.
 */
export function releaseDateBounds(request: { pickedUpAt: Date | null; createdAt: Date }, now: Date, saved?: string | null) {
    const startedOn = utcDay(request.pickedUpAt ?? request.createdAt);
    const earliest = dayOf(dayNumber(startedOn) - 1);
    return {
        startedOn,
        started: request.pickedUpAt ? 'picked up' as const : 'filed' as const,
        earliest: saved && saved < earliest ? saved : earliest,
        latest: dayOf(dayNumber(utcDay(now)) + 1),
    };
}

/** The moment whose day, in the viewer's zone, is the earliest release day: the pickup, else the filing. */
export const earliestReleaseAt = (request: { pickedUpAt: Date | null; createdAt: Date }) => (request.pickedUpAt ?? request.createdAt).toISOString();
