import "server-only";
import { randomUUID } from "node:crypto";
import { inArray, sql } from "drizzle-orm";
import { db, profiles } from "@/db";
import { notify } from "./notify";
import type { MemberAuth } from "./auth-guard";
import { MAX_REVIEWERS, PAID_SEATS_ONLY, reviewerKey, reviewStateOf, PROFILE_ROLE_LABELS, type ReviewerIdentity, type Reviewer } from "./request-reviewer-rules";
import { workspaceRoster, type RosterPerson } from "./workspace-roster";
import { insist, type RequestTx } from "./request-change-store";
import { canChangeThings } from "./role-rules";

export type ReviewNotification = {
  userId: string;
  type: "review_requested" | "review_looks_good" | "review_concern";
  detail: string;
};

/**
 * The rules for asking people to review, shared by adding from Request detail
 * and adding while creating a Request: only Admins and Members (the paid
 * seats on the roster, #211), not yourself, not the requester, no repeats and
 * at most twenty. Throws an RequestChangeError with the reason; returns the
 * new list and the "asked you to review" notification for each person added.
 */
export async function appendReviewers({
  existing,
  nominees,
  note,
  auth,
  requesterId,
  roster,
}: {
  existing: Reviewer[];
  nominees: ReviewerIdentity[];
  note: string;
  auth: MemberAuth;
  requesterId: string;
  roster: RosterPerson[];
}): Promise<{ reviewers: Reviewer[]; asked: ReviewNotification[] }> {
  const reviewers = [...existing];
  const asked: ReviewNotification[] = [];
  for (const nominee of nominees) {
    const person = roster.find(
      (p) => reviewerKey(p.nominee) === reviewerKey(nominee),
    );
    insist(person, PAID_SEATS_ONLY);
    insist(
      nominee.userId !== auth.userId,
      "You can’t add yourself as a reviewer.",
    );
    insist(
      nominee.userId !== requesterId,
      "The Requester can’t review their own Request.",
    );
    insist(
      !reviewers.some((r) => reviewerKey(r.nominee) === reviewerKey(nominee)),
      `${person.name} is already a reviewer.`,
    );
    reviewers.push({
      id: randomUUID(),
      nominee: person.nominee,
      displayNameAtSelection: person.name,
      addedBy: auth.userId,
      note,
      decision: null,
    });
    asked.push({ userId: person.nominee.userId, type: "review_requested", detail: note });
  }
  insist(
    reviewers.length <= MAX_REVIEWERS,
    `A Request can have at most ${MAX_REVIEWERS} reviewers.`,
  );
  return { reviewers, asked };
}

/**
 * Editing what an Open Request says resets its reviews (reset_reviews_on_edit,
 * migration 0031). Call inside the editing transaction, before the update, so
 * the reset notification names this editor rather than the requester.
 */
export async function nameReviewResetActor(tx: RequestTx, userId: string) {
  await tx.execute(sql`select set_config('lane.actor_id', ${userId}, true)`);
}

/** In-app bell only, through public.notify: nobody is told about their own
 * action, and only people with a profile can be told. One call per kind and
 * detail, inside the caller's transaction. */
export async function notifyReviewers(
  tx: RequestTx,
  request: { id: string; orgId: string },
  actorId: string,
  items: ReviewNotification[],
) {
  const groups = new Map<string, { type: ReviewNotification["type"]; detail: string; userIds: string[] }>();
  for (const item of items) {
    const key = JSON.stringify([item.type, item.detail]);
    const group = groups.get(key) ?? { type: item.type, detail: item.detail, userIds: [] };
    group.userIds.push(item.userId);
    groups.set(key, group);
  }
  for (const { type, detail, userIds } of groups.values())
    await tx.execute(sql`select ${notify(userIds, request.orgId, type, request.id, actorId, detail)}`);
}

/**
 * Whether each saved reviewer still counts: an Admin or Member still in the
 * workspace. A reviewer who left, or is no longer on a paid seat, stays
 * listed, greyed out, and their answer no longer counts (REQUIREMENTS §4.4).
 * The list, the reviewers panel and pickup confirmation all read this.
 * Worked out at read time from the roster; if it can't be read, everyone
 * counts and nobody is greyed out. Read only when there is a reviewer.
 *
 * `name` (B6): each person has one name, their sign-in name now. The name
 * saved when they were picked shows only once they've left the workspace, or
 * while the roster can't be read.
 */
export async function reviewerStanding(orgId: string, reviewers: Reviewer[]) {
  let active: Map<string, string> | null = null;
  if (reviewers.length)
    try {
      active = new Map((await workspaceRoster(orgId)).map((p) => [p.nominee.userId, p.name]));
    } catch {
      active = null;
    }
  return {
    counts: (r: Reviewer) => !active || active.has(r.nominee.userId),
    name: (r: Pick<Reviewer, "nominee" | "displayNameAtSelection">) => active?.get(r.nominee.userId) ?? r.displayNameAtSelection,
  };
}
export type ReviewerStanding = Awaited<ReturnType<typeof reviewerStanding>>;

/** The reviewers whose standing decides a review state: unanswered, or with a concern. */
export const outstandingReviewers = (reviewers: Reviewer[] | null) =>
  (reviewers ?? []).filter((r) => r.decision === null || r.decision.kind === "concern");

/** One Request's review state, its reviewers read through `standing`. */
export const reviewStateFrom = (reviewers: Reviewer[] | null, standing: ReviewerStanding) =>
  reviewStateOf((reviewers ?? []).map((r) => ({ name: standing.name(r), decision: r.decision, counts: standing.counts(r) })));

/** The review state of saved reviewers: only reviewers who still count. */
export async function reviewStatesOf(orgId: string, rows: { id: string; reviewers: Reviewer[] | null }[]) {
  const standing = await reviewerStanding(orgId, rows.flatMap((row) => outstandingReviewers(row.reviewers)));
  return new Map(rows.map((row) => [row.id, reviewStateFrom(row.reviewers, standing)]));
}

/**
 * Each saved reviewer as the reviewers panel shows it to this viewer: the
 * profile role (grey information only), whether they still count
 * (`reviewerStanding`), and whether this viewer may answer.
 */
export async function reviewerViews(saved: Reviewer[], auth: MemberAuth, open: boolean) {
  const standing = await reviewerStanding(auth.orgId, saved);
  const memberIds = saved.map((r) => r.nominee.userId);
  const roles = memberIds.length
    ? await db
        .select({ id: profiles.id, role: profiles.role })
        .from(profiles)
        .where(inArray(profiles.id, memberIds))
    : [];
  return saved.map((r) => {
    const userId = r.nominee.userId;
    const role = roles.find((p) => p.id === userId)?.role;
    return {
      id: r.id,
      name: standing.name(r),
      note: r.note,
      decision: r.decision,
      active: standing.counts(r),
      role: role ? PROFILE_ROLE_LABELS[role] : null,
      canAnswer: open && canChangeThings(auth.role) && userId === auth.userId,
    };
  });
}
