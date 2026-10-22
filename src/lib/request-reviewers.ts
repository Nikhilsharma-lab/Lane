import "server-only";
import { randomUUID } from "node:crypto";
import { inArray, sql } from "drizzle-orm";
import { db, profiles } from "@/db";
import { notify } from "./notify";
import type { MemberAuth } from "./auth-guard";
import { MAX_REVIEWERS, reviewerKey, reviewStateOf, PROFILE_ROLE_LABELS, type ReviewerIdentity, type Reviewer } from "./request-reviewer-rules";
import {
  pendingInvitations,
  workspaceRoster,
  distinctPeople,
  invitationState,
  resolveInvitedMember,
  type WorkspacePerson,
} from "./workspace-roster";
import { insist, type RequestTx } from "./request-change-store";

export type ReviewNotification = {
  userId: string;
  type: "review_requested" | "review_looks_good" | "review_concern";
  detail: string;
};

/**
 * The rules for asking people to review, shared by adding from Request detail
 * and adding while creating a Request: no guests (they are not on the roster),
 * not yourself, not the requester, no repeats, at most twenty, and only admins
 * invite by email. Throws an RequestChangeError with the reason; returns the new
 * list and the "asked you to review" notification for each member added.
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
  roster: WorkspacePerson[];
}): Promise<{ reviewers: Reviewer[]; asked: ReviewNotification[] }> {
  const inviting = nominees.some((n) => n.kind === "invitation");
  insist(
    !inviting || auth.role === "admin",
    "Only an admin can invite someone by email.",
  );
  const people = inviting
    ? [...roster, ...(await pendingInvitations(auth.orgId))]
    : roster;
  const reviewers = [...existing];
  const asked: ReviewNotification[] = [];
  for (const nominee of nominees) {
    const person = people.find(
      (p) => reviewerKey(p.nominee) === reviewerKey(nominee),
    );
    insist(person, "A selected person is no longer available.");
    if (nominee.kind === "member") {
      insist(
        nominee.userId !== auth.userId,
        "You can’t add yourself as a reviewer.",
      );
      insist(
        nominee.userId !== requesterId,
        "The requester can’t review their own Request.",
      );
    }
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
    if (person.nominee.kind === "member")
      asked.push({ userId: person.nominee.userId, type: "review_requested", detail: note });
  }
  insist(
    reviewers.length <= MAX_REVIEWERS,
    `A Request can have at most ${MAX_REVIEWERS} reviewers.`,
  );
  // An invitation may target the verified email of someone already reviewing.
  if (reviewers.some((r) => r.nominee.kind === "invitation"))
    insist(
      await distinctPeople(
        reviewers.map((r) => ({
          nominee: r.nominee,
          name: r.displayNameAtSelection,
          email: r.nominee.kind === "invitation" ? r.nominee.email : "",
        })),
      ),
      "That invitation is for someone who is already a reviewer.",
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
 * Whether each saved reviewer still counts: a member still in the workspace,
 * or an invitation still pending or accepted. A reviewer who left stays
 * listed, greyed out, and their answer no longer counts (REQUIREMENTS §4.4).
 * The list, the reviewers panel and pickup confirmation all read this.
 * Worked out at read time from the identity provider; if it is unreachable,
 * everyone counts and nobody is greyed out. Asks the provider only when some
 * reviewer is an invitation or a member.
 */
export async function reviewerStanding(orgId: string, reviewers: Reviewer[]) {
  const members = reviewers.some((r) => r.nominee.kind === "member");
  const invitations = reviewers.flatMap((r) => (r.nominee.kind === "invitation" ? [r.nominee] : []));
  let active: Set<string> | null = null;
  if (members)
    try {
      active = new Set((await workspaceRoster(orgId)).flatMap((p) => (p.nominee.kind === "member" ? [p.nominee.userId] : [])));
    } catch {
      active = null;
    }
  const states = new Map<string, string>();
  if (invitations.length) {
    let pending: Set<string> | null = null;
    try {
      pending = new Set((await pendingInvitations(orgId)).flatMap((p) => (p.nominee.kind === "invitation" ? [p.nominee.invitationId] : [])));
    } catch {
      pending = null;
    }
    for (const nominee of invitations) {
      if (pending?.has(nominee.invitationId)) states.set(nominee.invitationId, "pending");
      else if (pending)
        try {
          states.set(nominee.invitationId, (await invitationState(orgId, nominee)) ?? "unavailable");
        } catch {
          /* Unknown: it counts, like an unreachable roster. */
        }
    }
  }
  return {
    /** The invitation's provider state, when it could be read. */
    invitation: (r: Reviewer) => (r.nominee.kind === "invitation" ? states.get(r.nominee.invitationId) ?? null : null),
    counts: (r: Reviewer) => {
      if (r.nominee.kind === "member") return !active || active.has(r.nominee.userId);
      const state = states.get(r.nominee.invitationId);
      return state === undefined || state === "pending" || state === "accepted";
    },
  };
}

/** The review state of saved reviewers: only reviewers who still count. */
export async function reviewStatesOf(orgId: string, rows: { id: string; reviewers: Reviewer[] | null }[]) {
  const outstanding = rows.flatMap((row) => (row.reviewers ?? []).filter((r) => r.decision === null || r.decision.kind === "concern"));
  const standing = outstanding.length ? await reviewerStanding(orgId, outstanding) : null;
  return new Map(rows.map((row) => [row.id, reviewStateOf((row.reviewers ?? []).map((r) => ({
    name: r.displayNameAtSelection,
    decision: r.decision,
    counts: standing ? standing.counts(r) : true,
  })))]));
}

/**
 * Each saved reviewer as the reviewers panel shows it to this viewer: the
 * profile role (grey information only), whether they still count
 * (`reviewerStanding`), and whether this viewer may answer.
 */
export async function reviewerViews(saved: Reviewer[], auth: MemberAuth, open: boolean) {
  const standing = await reviewerStanding(auth.orgId, saved);
  const memberIds = saved.flatMap((r) =>
    r.nominee.kind === "member" ? [r.nominee.userId] : [],
  );
  const roles = memberIds.length
    ? await db
        .select({ id: profiles.id, role: profiles.role })
        .from(profiles)
        .where(inArray(profiles.id, memberIds))
    : [];
  return Promise.all(
    saved.map(async (r) => {
      const view = {
        id: r.id,
        name: r.displayNameAtSelection,
        note: r.note,
        decision: r.decision,
        active: standing.counts(r),
      };
      if (r.nominee.kind === "member") {
        const userId = r.nominee.userId;
        const role = roles.find((p) => p.id === userId)?.role;
        return {
          ...view,
          role: role ? PROFILE_ROLE_LABELS[role] : null,
          invitation: null,
          canAnswer: open && auth.role !== "guest" && userId === auth.userId,
        };
      }
      const state = standing.invitation(r) ?? "unavailable";
      let canAnswer = false;
      try {
        canAnswer =
          open &&
          auth.role !== "guest" &&
          state === "accepted" &&
          (await resolveInvitedMember(auth.orgId, r.nominee, auth.userId));
      } catch {
        canAnswer = false;
      }
      return { ...view, role: null, invitation: state, canAnswer };
    }),
  );
}
