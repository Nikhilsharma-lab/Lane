/**
 * The release record's plain reads, with no zod: who the Requester is and how far the result's due date is.
 * Client surfaces (the list, the shell, the journey module) import these; request-release.ts re-exports them
 * beside the change schemas the server validates with.
 */
import type { ReleaseFact, ReleaseState } from './request-release';
import { daysUntil } from './utc-day';

/** The current Requester: the release record's, after any handover, else whoever created the Request. Authorship never changes. */
export function requesterOf(request: {
    createdBy: string;
    releaseState?: ReleaseState | null;
}): string {
    return request.releaseState?.ownerId ?? request.createdBy;
}

const plural = (n: number) => `${n} day${n === 1 ? '' : 's'}`;
/** The words for whole UTC days to (or past) a due date: "Due in N days", "Due today" or "Overdue N days". */
export function dueWords(days: number): string {
    return days === 0 ? 'Due today' : days > 0 ? `Due in ${plural(days)}` : `Overdue ${plural(-days)}`;
}

export function releaseMeasurement(release: ReleaseFact | null, now: Date) {
    if (!release)
        return null;
    const days = daysUntil(release.dueDate, now);
    return { due: days <= 0, days, label: dueWords(days) };
}
