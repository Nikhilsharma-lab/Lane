import "server-only";
import { randomUUID } from "node:crypto";
import { inArray } from "drizzle-orm";
import { notifications, profiles } from "@/db";
import { MAX_REVIEWERS, type Nominee, type Reviewer } from "./request-agreement";
import {
  agreementInvitations,
  distinctAgreementPeople,
  nomineeKey,
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
  auth: { userId: string; orgId: string; role: string };
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
