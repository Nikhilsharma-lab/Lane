/**
 * The release record's plain reads, with no zod: who the Requester is and how far the result's due date is.
 * Client surfaces (the list, the shell, the journey module) import these; request-release.ts re-exports them
 * beside the change schemas the server validates with.
 */
import type { ReleaseChange, ReleaseFact, ReleaseState } from './request-release';
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

/**
 * The value recorded before this release (#151 decision 3), from the release or correction event that set it. It lives in
 * that event's input: the database fixes the shape of the release fact itself. Null before this change, and for a release
 * that needed none. Matched on the release's own facts, so a closure reads the value of the release it closed on.
 */
export function valueBeforeReleaseFor(state: ReleaseState | null | undefined, release: ReleaseFact | null): { value: number; unit: string } | null {
    if (!state || !release) return null;
    const same = (other: ReleaseFact) => other.exposureDate === release.exposureDate && other.dueDate === release.dueDate && other.startDate === release.startDate && other.windowKind === release.windowKind && other.evidence === release.evidence && other.audience === release.audience;
    for (let i = state.history.length - 1; i >= 0; i--) {
        const event = state.history[i];
        if ((event.input.kind === 'release' || event.input.kind === 'correct') && event.release && same(event.release)) {
            const input: ReleaseChange = event.input;
            return input.kind === 'release' || input.kind === 'correct' ? input.valueBeforeRelease ?? null : null;
        }
    }
    return null;
}

export function releaseMeasurement(release: ReleaseFact | null, now: Date) {
    if (!release)
        return null;
    const days = daysUntil(release.dueDate, now);
    return { due: days <= 0, days, label: dueWords(days) };
}

/** The saved Request's audience is the audience agreed before release. */
export const agreedAudience = (request: { affectedPeople: string | null }) => request.affectedPeople?.trim() || 'Everyone this Request is for';
