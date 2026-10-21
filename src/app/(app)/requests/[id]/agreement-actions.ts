"use server";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { and, eq, inArray } from "drizzle-orm";
import { db, notifications, profiles, requests, requestAgreements } from "@/db";
import { requireActiveMember, requireMemberOrAbove } from "@/lib/auth-guard";
import {
  addReviewersSchema,
  removeReviewerSchema,
  answerReviewSchema,
  MAX_REVIEWERS,
  PROFILE_ROLE_LABELS,
  type AgreementContext,
  type Reviewer,
} from "@/lib/request-agreement";
import {
  agreementRoster,
  agreementInvitations,
  nomineeKey,
  resolveInvitedMember,
  invitationState,
  distinctAgreementPeople,
} from "@/lib/request-agreement-members";
import {
  mutateAgreement,
  insist,
  AgreementError,
  type AgreementTx,
  type AgreementRequest,
  type AgreementRow,
} from "@/lib/request-agreement-store";

async function saveReviewers(
  tx: AgreementTx,
  request: AgreementRequest,
  agreement: AgreementRow | undefined,
  reviewers: Reviewer[],
) {
  if (agreement)
    await tx
      .update(requestAgreements)
      .set({ reviewers })
      .where(
        and(
          eq(requestAgreements.requestId, request.id),
          eq(requestAgreements.orgId, request.orgId),
        ),
      );
  else
    await tx
      .insert(requestAgreements)
      .values({ orgId: request.orgId, requestId: request.id, reviewers });
}

type ReviewNotification = {
  userId: string;
  type: "review_requested" | "review_looks_good" | "review_concern";
  detail: string;
};

/** In-app bell only. Nobody is told about their own action, and only people with a profile can be told. */
async function notifyReviewers(
  tx: AgreementTx,
  request: AgreementRequest,
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

/** Any non-guest member asks people to look at an Open Request. Only admins invite by email. */
export async function addReviewers(context: AgreementContext, input: unknown) {
  const parsed = addReviewersSchema.safeParse(input);
  if (!parsed.success) return { error: "Choose people to review." };
  return mutateAgreement(
    context,
    parsed.data,
    "reviewers_added",
    async (tx, request, agreement, auth, roster) => {
      const inviting = parsed.data.nominees.some((n) => n.kind === "invitation");
      insist(
        !inviting || auth.role === "admin",
        "Only an admin can invite someone by email.",
      );
      const people = inviting
        ? [...roster, ...(await agreementInvitations(auth.orgId))]
        : roster;
      const reviewers = [...(agreement?.reviewers ?? [])];
      const added = [];
      for (const nominee of parsed.data.nominees) {
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
            nominee.userId !== request.createdBy,
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
          note: parsed.data.note,
          decision: null,
        });
        added.push(person);
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
      await saveReviewers(tx, request, agreement, reviewers);
      await notifyReviewers(
        tx,
        request,
        auth.userId,
        added.flatMap((person) =>
          person.nominee.kind === "member"
            ? [{ userId: person.nominee.userId, type: "review_requested" as const, detail: parsed.data.note }]
            : [],
        ),
      );
    },
  );
}

/** The requester or an admin takes someone off an Open Request. */
export async function removeReviewer(context: AgreementContext, input: unknown) {
  const parsed = removeReviewerSchema.safeParse(input);
  if (!parsed.success) return { error: "Choose a reviewer to remove." };
  return mutateAgreement(
    context,
    parsed.data,
    "reviewer_removed",
    async (tx, request, agreement, auth) => {
      insist(
        request.createdBy === auth.userId || auth.role === "admin",
        "Only the requester or an admin can remove a reviewer.",
      );
      const reviewers = agreement?.reviewers ?? [];
      insist(
        reviewers.some((r) => r.id === parsed.data.reviewerId),
        "This reviewer was already removed. Reload to see the latest.",
      );
      await saveReviewers(
        tx,
        request,
        agreement,
        reviewers.filter((r) => r.id !== parsed.data.reviewerId),
      );
    },
  );
}

/** Only the named reviewer answers: Looks good, or a concern with its reason. They can change it later. */
export async function answerReview(context: AgreementContext, input: unknown) {
  const parsed = answerReviewSchema.safeParse(input);
  if (!parsed.success) return { error: "Invalid review answer." };
  if (parsed.data.kind === "concern" && !parsed.data.reason)
    return { error: "Say what concerns you." };
  return mutateAgreement(
    context,
    parsed.data,
    "reviewed",
    async (tx, request, agreement, auth) => {
      const reviewers = structuredClone(agreement?.reviewers ?? []);
      const reviewer = reviewers.find((r) => r.id === parsed.data.reviewerId);
      insist(reviewer, "This review was removed. Reload to see the latest.");
      if (reviewer.nominee.kind === "invitation") {
        insist(
          await resolveInvitedMember(auth.orgId, reviewer.nominee, auth.userId),
          "Only the invited person can answer, once they have joined and verified their email.",
        );
        insist(
          !reviewers.some(
            (r) => r.nominee.kind === "member" && r.nominee.userId === auth.userId,
          ),
          "You are already a reviewer on this Request.",
        );
        reviewer.nominee = { kind: "member", userId: auth.userId };
      }
      insist(
        reviewer.nominee.userId === auth.userId,
        "Only the named reviewer can answer.",
      );
      reviewer.decision = {
        kind: parsed.data.kind,
        actorId: auth.userId,
        at: new Date().toISOString(),
        reason: parsed.data.kind === "concern" ? parsed.data.reason : "",
      };
      await saveReviewers(tx, request, agreement, reviewers);
      await notifyReviewers(tx, request, auth.userId, [
        {
          userId: reviewer.addedBy,
          type: parsed.data.kind === "concern" ? "review_concern" : "review_looks_good",
          detail: reviewer.decision.reason,
        },
      ]);
    },
  );
}

export async function readReviews(
  requestId: string,
  context: { orgId: string },
) {
  try {
    if (!z.uuid().safeParse(requestId).success)
      return { error: "Request unavailable." };
    const auth = await requireActiveMember(context.orgId);
    insist(auth, "Request unavailable.");
    const [request] = await db
      .select()
      .from(requests)
      .where(and(eq(requests.id, requestId), eq(requests.orgId, auth.orgId)));
    insist(
      request && (auth.role !== "guest" || request.createdBy === auth.userId),
      "Request unavailable.",
    );
    const [agreement] = await db
      .select()
      .from(requestAgreements)
      .where(
        and(
          eq(requestAgreements.requestId, requestId),
          eq(requestAgreements.orgId, auth.orgId),
        ),
      );
    const saved = agreement?.reviewers ?? [];
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
    const open = request.status === "open";
    const reviewers = await Promise.all(
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
    return {
      requestId,
      revision: request.agreementRevision,
      open,
      canAdd: open && auth.role !== "guest",
      canInvite: open && auth.role === "admin",
      canRemove:
        open && (request.createdBy === auth.userId || auth.role === "admin"),
      /** People the picker leaves out: the viewer, the requester and anyone already reviewing. */
      unavailable: [
        nomineeKey({ kind: "member", userId: auth.userId }),
        nomineeKey({ kind: "member", userId: request.createdBy }),
        ...saved.map((r) => nomineeKey(r.nominee)),
      ],
      reviewers,
    };
  } catch (e) {
    return {
      error:
        e instanceof AgreementError
          ? e.message
          : "Could not load reviews. Try again.",
    };
  }
}

/** Members to choose from, plus pending invitations for admins. */
export async function loadReviewerPeople(context: { orgId: string }) {
  const auth = await requireMemberOrAbove(context.orgId);
  if (!auth) return { error: "Workspace unavailable." };
  try {
    return {
      people: [
        ...(await agreementRoster(auth.orgId)),
        ...(auth.role === "admin" ? await agreementInvitations(auth.orgId) : []),
      ],
    };
  } catch {
    return { error: "Could not load people. Try again." };
  }
}
