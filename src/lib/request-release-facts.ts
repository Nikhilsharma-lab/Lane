/**
 * The release record's plain reads, with no zod: who the Requester is and how far the result's due date is.
 * Client surfaces (the list, the shell, the journey module) import these; request-release.ts re-exports them
 * beside the change schemas the server validates with.
 */
import type { ReleaseFact, ReleaseState } from './request-release';

/** Shared owner contract for release and ticket #60 closure. Authorship never changes. */
export function releaseOwner(request: {
    createdBy: string;
    releaseState?: ReleaseState | null;
}) {
    return request.releaseState?.ownerId ?? request.createdBy;
}
export function releaseMeasurement(release: ReleaseFact | null, now: Date) {
    if (!release)
        return null;
    const today = now.toISOString().slice(0, 10);
    const days = Math.round((Date.parse(release.dueDate + 'T00:00:00Z') - Date.parse(today + 'T00:00:00Z')) / 86400000);
    return { due: days <= 0, days, label: days === 0 ? 'Due today' : days > 0 ? `${days} day${days === 1 ? '' : 's'} remaining` : `${-days} day${days === -1 ? '' : 's'} overdue` };
}
