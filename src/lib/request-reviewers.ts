import "server-only";
import { randomUUID } from "node:crypto";
import { inArray, sql } from "drizzle-orm";
import { db, notifications, profiles } from "@/db";
import type { MemberAuth } from "./auth-guard";
import { MAX_REVIEWERS, nomineeKey, PROFILE_ROLE_LABELS, type Nominee, type Reviewer } from "./request-agreement";
import {
  agreementInvitations,
  agreementRoster,
  distinctAgreementPeople,
  invitationState,
  resolveInvitedMember,
  type AgreementPerson,
} from "./request-agreement-members";
import { insist, type AgreementTx } from "./request-agreement-store";

export type ReviewNotification = {
  userId: string;
  type: "review_requested" | "review_looks_good" | "review_concern";
  detail: string;
};

/**
 * The rules for asking people to review, shared by adding from Request detail
 * and adding while creating a Request: no guests (they are not on the roster),
 * not yourself, not the requester, no repeats, at most twenty, and only admins
 * invite by email. Throws an AgreementError with the reason; returns the new
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
  nominees: Nominee[];
  note: string;
  auth: MemberAuth;
  requesterId: string;
  roster: AgreementPerson[];
}): Promise<{ reviewers: Reviewer[]; asked: ReviewNotification[] }> {
  const inviting = nominees.some((n) => n.kind === "invitation");
  insist(
    !inviting || auth.role === "admin",
    "Only an admin can invite someone by email.",
  );
  const people = inviting
    ? [...roster, ...(await agreementInvitations(auth.orgId))]
    : roster;
  const reviewers = [...existing];
  const asked: ReviewNotification[] = [];
  for (const nominee of nominees) {
    const person = people.find(
      (p) => nomineeKey(p.nominee) === nomineeKey(nominee),
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
      !reviewers.some((r) => nomineeKey(r.nominee) === nomineeKey(nominee)),
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
      await distinctAgreementPeople(
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
export async function nameReviewResetActor(tx: AgreementTx, userId: string) {
  await tx.execute(sql`select set_config('lane.actor_id', ${userId}, true)`);
}

/** In-app bell only. Nobody is told about their own action, and only people with a profile can be told. */
export async function notifyReviewers(
  tx: AgreementTx,
  request: { id: string; orgId: string },
  actorId: string,
  items: ReviewNotification[],
) {
  const recipients = items.filter((item) => item.userId !== actorId);
  if (!recipients.length) return;
  const known = new Set(
    (
      await tx
        .select({ id: profiles.id })
        .from(profiles)
        .where(inArray(profiles.id, recipients.map((item) => item.userId)))
    ).map((p) => p.id),
  );
  const values = recipients
    .filter((item) => known.has(item.userId))
    .map((item) => ({
      userId: item.userId,
      orgId: request.orgId,
      type: item.type,
      requestId: request.id,
      actorId,
      detail: item.detail || null,
    }));
  if (values.length) await tx.insert(notifications).values(values);
}

/**
 * Each saved reviewer as the reviewers panel shows it to this viewer: the
 * profile role (grey information only), whether they are still in the
 * workspace or their invitation still stands, and whether this viewer may
 * answer.
 */
export async function reviewerViews(saved: Reviewer[], auth: MemberAuth, open: boolean) {
  // Worked out at read time from the identity provider; if it is unreachable nobody is greyed out.
  let active: Set<string> | null = null;
  try {
    active = new Set(
      (await agreementRoster(auth.orgId)).flatMap((p) =>
        p.nominee.kind === "member" ? [p.nominee.userId] : [],
      ),
    );
  } catch {
    active = null;
  }
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
      };
      if (r.nominee.kind === "member") {
        const userId = r.nominee.userId;
        const role = roles.find((p) => p.id === userId)?.role;
        return {
          ...view,
          role: role ? PROFILE_ROLE_LABELS[role] : null,
          active: !active || active.has(userId),
          invitation: null,
          canAnswer: open && auth.role !== "guest" && userId === auth.userId,
        };
      }
      let state = "unavailable";
      let canAnswer = false;
      try {
        state = (await invitationState(auth.orgId, r.nominee)) ?? "unavailable";
        canAnswer =
          open &&
          auth.role !== "guest" &&
          state === "accepted" &&
          (await resolveInvitedMember(auth.orgId, r.nominee, auth.userId));
      } catch {
        state = "unavailable";
      }
      return {
        ...view,
        role: null,
        active: state === "pending" || state === "accepted",
        invitation: state,
        canAnswer,
      };
    }),
  );
}
