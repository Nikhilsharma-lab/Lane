"use server";
import { agreementAttachments } from "@/lib/request-agreement-attachments";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { and, eq, or } from "drizzle-orm";
import {
  db,
  requests,
  requestAgreementEvents,
  requestReplacements,
  requestAgreements,
} from "@/db";
import {
  prepareAgreementSchema,
  disciplines,
  disciplineSchema,
  nomineeSchema,
  commitmentValues,
  type Discipline,
  type AgreementContext,
  type AgreementSeats,
  type AgreementSnapshot,
  type PreparedAgreement,
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
  commitmentToken,
  AgreementError,
  type AgreementRow,
} from "@/lib/request-agreement-store";
const replacementParticipantSchema = z
  .object({
    seat: disciplineSchema,
    nominee: nomineeSchema,
    reason: z.string().trim().min(1).max(4000),
    unavailable: z.boolean().default(false),
  })
  .strict();
function participantChange(
  payload: (typeof requestAgreementEvents.$inferSelect)["payload"],
) {
  const parsed = replacementParticipantSchema.safeParse(payload.input);
  if (!parsed.success) return null;
  const previous = payload.before as AgreementRow | null;
  const next = payload.after as AgreementRow | null;
  return {
    seat: parsed.data.seat,
    previousName:
      previous?.seats[parsed.data.seat]?.displayNameAtSelection || "Unassigned",
    nextName:
      next?.seats[parsed.data.seat]?.displayNameAtSelection || "Unassigned",
    reason: parsed.data.reason,
    unavailable: parsed.data.unavailable,
  };
}
function changedFields(
  original: AgreementSnapshot,
  next: AgreementSnapshot["request"],
  prepared: PreparedAgreement,
) {
  return [
    ...Object.keys(next).filter(
      (k) =>
        commitmentToken(next[k as keyof typeof next]) !==
        commitmentToken(original.request[k as keyof typeof next]),
    ),
    ...Object.keys(prepared).filter(
      (k) =>
        prepared[k as keyof typeof prepared] !==
        original.prepared[k as keyof typeof prepared],
    ),
  ];
}
export async function prepareAgreement(
  context: AgreementContext,
  input: unknown,
) {
  const parsed = prepareAgreementSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  return mutateAgreement(
    context,
    parsed.data,
    "prepared",
    true,
    async (tx, request, agreement, auth) => {
      insist(
        !agreement?.snapshot,
        "This commitment is frozen. Create a linked replacement for material changes.",
      );
      const people = [
        ...(await agreementRoster(auth.orgId)),
        ...(await agreementInvitations(auth.orgId)),
      ];
      insist(
        people.some(
          (p) =>
            p.nominee.kind === "member" && p.nominee.userId === auth.userId,
        ),
        "Your workspace membership could not be verified.",
      );
      const used = new Set<string>();
      const seats: AgreementSeats = {
        pm: null,
        designer: null,
        developer: null,
      };
      for (const seat of disciplines) {
        const nominee = parsed.data.nominees[seat];
        if (!nominee) continue;
        const person = people.find(
          (p) => nomineeKey(p.nominee) === nomineeKey(nominee),
        );
        insist(person, "A selected participant is no longer available.");
        const identity = person.email || nomineeKey(person.nominee);
        insist(!used.has(identity), "Choose three distinct people.");
        used.add(identity);
        seats[seat] = {
          generation: (agreement?.seats[seat]?.generation ?? 0) + 1,
          nominee: person.nominee,
          decision: null,
          displayNameAtSelection: person.name,
        };
      }
      insist(
        await distinctAgreementPeople(
          disciplines.flatMap((d) => {
            const n = seats[d]?.nominee;
            const p =
              n && people.find((p) => nomineeKey(p.nominee) === nomineeKey(n));
            return p ? [p] : [];
          }),
        ),
        "Choose three distinct people; an invite cannot duplicate a member’s verified email.",
      );
      const concerns = parsed.data.blockers.map((b) => ({
        id: randomUUID(),
        author: auth.userId,
        seat: b.seat,
        generation: seats[b.seat]?.generation ?? 1,
        reason: b.reason,
        openedAt: new Date().toISOString(),
        resolution: null,
      }));
      const values = { prepared: parsed.data.prepared, seats, concerns };
      if (agreement)
        await tx
          .update(requestAgreements)
          .set(values)
          .where(
            and(
              eq(requestAgreements.requestId, request.id),
              eq(requestAgreements.orgId, auth.orgId),
            ),
          );
      else
        await tx
          .insert(requestAgreements)
          .values({ orgId: auth.orgId, requestId: request.id, ...values });
    },
  );
}

export async function readAgreement(
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
    const agreement = (await db
      .select()
      .from(requestAgreements)
      .where(
        and(
          eq(requestAgreements.requestId, requestId),
          eq(requestAgreements.orgId, auth.orgId),
        ),
      )).at(0);
    const attachments = await agreementAttachments(db, requestId, auth);
    const history = await db
      .select()
      .from(requestAgreementEvents)
      .where(
        and(
          eq(requestAgreementEvents.requestId, requestId),
          eq(requestAgreementEvents.orgId, auth.orgId),
        ),
      )
      .orderBy(requestAgreementEvents.revision);
    const links = await db
      .select()
      .from(requestReplacements)
      .where(
        and(
          eq(requestReplacements.orgId, auth.orgId),
          or(
            eq(requestReplacements.originalId, requestId),
            eq(requestReplacements.replacementId, requestId),
          ),
        ),
      );
    if (agreement)
      for (const link of links.filter((l) => l.replacementId === requestId)) {
        const [original] = await db
          .select()
          .from(requestAgreements)
          .where(
            and(
              eq(requestAgreements.requestId, link.originalId),
              eq(requestAgreements.orgId, auth.orgId),
            ),
          );
        if (original?.snapshot)
          link.changedFields = changedFields(
            original.snapshot,
            agreement.snapshot?.request ?? commitmentValues(request),
            agreement.snapshot?.prepared ?? agreement.prepared,
          );
      }
    const eligibleSeats: Discipline[] = [];
    const invitationStates: Partial<Record<Discipline, string>> = {};
    if (agreement && !request.exceptionClosure && auth.role !== "guest")
      for (const d of disciplines) {
        const nominee = agreement.seats[d]?.nominee;
        if (nominee?.kind === "member" && nominee.userId === auth.userId)
          eligibleSeats.push(d);
        if (nominee?.kind === "invitation")
          try {
            invitationStates[d] = await invitationState(auth.orgId, nominee);
            if (
              invitationStates[d] === "accepted" &&
              (await resolveInvitedMember(auth.orgId, nominee, auth.userId))
            )
              eligibleSeats.push(d);
          } catch {
            invitationStates[d] = "unavailable";
          }
      }
    return {
      released: Boolean(request.releaseState?.release),
      eligibleSeats,
      invitationStates,
      attachments: [...attachments],
      requestId,
      revision: request.agreementRevision,
      creatorId: request.createdBy,
      closure: request.exceptionClosure,
      agreement: agreement ?? null,
      history: history.map((e) => ({
        id: e.id,
        kind: e.kind,
        actorId: e.actorId,
        at: e.createdAt.toISOString(),
        participantChange:
          e.kind === "participant_replaced"
            ? participantChange(e.payload)
            : null,
        input:
          e.kind === "replacement_created"
            ? { replacementId: e.payload.result.replacementId }
            : e.payload.input,
      })),
      links,
      commitmentToken: commitmentToken({
        request: commitmentValues(request),
        attachments,
        prepared: agreement?.prepared,
      }),
      request: commitmentValues(request),
    };
  } catch (e) {
    return {
      error:
        e instanceof AgreementError
          ? e.message
          : "Could not load agreement. Try again.",
    };
  }
}
export async function loadAgreementPeople(context: { orgId: string }) {
  const auth = await requireMemberOrAbove(context.orgId);
  if (!auth) return { error: "Workspace unavailable." };
  try {
    return {
      people: [
        ...(await agreementRoster(auth.orgId)),
        ...(await agreementInvitations(auth.orgId)),
      ],
    };
  } catch {
    return { error: "Could not load participants. Try again." };
  }
}
export async function submitAgreement(
  context: AgreementContext,
  input: unknown,
) {
  const parsed = z
    .object({ commitmentToken: z.string().length(64) })
    .strict()
    .safeParse(input);
  if (!parsed.success)
    return { error: "Reload the commitment before submitting." };
  return mutateAgreement(
    context,
    parsed.data,
    "submitted",
    true,
    async (tx, request, agreement, auth) => {
      insist(
        agreement && !agreement.snapshot,
        "Prepare agreement before submitting, or reload the submitted commitment.",
      );
      const attachments = await agreementAttachments(tx, request.id, auth);
      insist(
        parsed.data.commitmentToken ===
          commitmentToken({
            request: commitmentValues(request),
            attachments,
            prepared: agreement.prepared,
          }),
        "The commitment changed. Reload before submitting.",
      );
      insist(
        expectedImpactSchema.safeParse(request.expectedImpact).success,
        "Complete Expected impact before requesting agreement.",
      );
      const measurementIssue = measurementReadiness(
        request.expectedImpact,
        request.requestType,
      );
      insist(
        !measurementIssue,
        measurementIssue ||
          "Complete Expected impact before requesting agreement.",
      );
      const people = [
        ...(await agreementRoster(auth.orgId)),
        ...(await agreementInvitations(auth.orgId)),
      ];
      const identities = new Set<string>();
      for (const d of disciplines) {
        const seat = agreement.seats[d];
        insist(seat, "Choose three participants.");
        const person = people.find(
          (p) => nomineeKey(p.nominee) === nomineeKey(seat.nominee),
        );
        insist(
          person,
          "A participant is no longer available. Replace their nomination.",
        );
        const key = person.email || nomineeKey(person.nominee);
        insist(!identities.has(key), "Choose three distinct people.");
        identities.add(key);
      }
      insist(
        await distinctAgreementPeople(
          disciplines.map(
            (d) =>
              people.find(
                (p) =>
                  nomineeKey(p.nominee) ===
                  nomineeKey(agreement.seats[d]!.nominee),
              )!,
          ),
        ),
        "Choose three distinct people.",
      );
      insist(
        people.some(
          (p) =>
            p.nominee.kind === "member" && p.nominee.userId === auth.userId,
        ),
        "Your membership could not be verified.",
      );
      const [incoming] = await tx
        .select()
        .from(requestReplacements)
        .where(
          and(
            eq(requestReplacements.replacementId, request.id),
            eq(requestReplacements.orgId, auth.orgId),
          ),
        );
      if (incoming) {
        const [original] = await tx
          .select()
          .from(requestAgreements)
          .where(
            and(
              eq(requestAgreements.requestId, incoming.originalId),
              eq(requestAgreements.orgId, auth.orgId),
            ),
          );
        insist(original?.snapshot, "Original commitment unavailable.");
        await tx
          .update(requestReplacements)
          .set({
            changedFields: changedFields(
              original.snapshot,
              commitmentValues(request),
              agreement.prepared,
            ),
          })
          .where(
            and(
              eq(requestReplacements.originalId, incoming.originalId),
              eq(requestReplacements.orgId, auth.orgId),
            ),
          );
      }
      await tx
        .update(requestAgreements)
        .set({
          snapshot: {
            version: 1,
            request: commitmentValues(request),
            prepared: agreement.prepared,
            attachmentIds: attachments.map((a) => a.id),
          },
          submittedBy: auth.userId,
          submittedAt: new Date(),
        })
        .where(
          and(
            eq(requestAgreements.requestId, request.id),
            eq(requestAgreements.orgId, auth.orgId),
          ),
        );
    },
  );
}
export async function decideAgreement(
  context: AgreementContext,
  input: unknown,
) {
  const parsed = z
    .object({
      seat: disciplineSchema,
      generation: z.number().int().positive(),
      kind: z.enum(["agree", "request_changes", "withdraw"]),
      reason: z.string().trim().max(4000),
    })
    .strict()
    .safeParse(input);
  if (!parsed.success) return { error: "Invalid agreement decision." };
  if (parsed.data.kind !== "agree" && !parsed.data.reason)
    return { error: "Give a reason for this decision." };
  return mutateAgreement(
    context,
    parsed.data,
    "decided",
    false,
    async (tx, request, agreement, auth) => {
      insist(agreement?.snapshot, "Agreement has not been submitted.");
      const seat = agreement.seats[parsed.data.seat];
      insist(
        seat && seat.generation === parsed.data.generation,
        "This participant changed. Reload before deciding.",
      );
      const people = await agreementRoster(auth.orgId);
      insist(
        people.some(
          (p) =>
            p.nominee.kind === "member" && p.nominee.userId === auth.userId,
        ),
        "Your membership is no longer active.",
      );
      if (seat.nominee.kind === "invitation") {
        insist(
          await resolveInvitedMember(auth.orgId, seat.nominee, auth.userId),
          "Only the invited participant can decide.",
        );
        insist(
          !disciplines.some(
            (d) =>
              d !== parsed.data.seat &&
              agreement.seats[d]?.nominee.kind === "member" &&
              (agreement.seats[d]?.nominee as { userId?: string }).userId ===
                auth.userId,
          ),
          "Choose three distinct people.",
        );
        seat.nominee = { kind: "member", userId: auth.userId };
      }
      insist(
        seat.nominee.userId === auth.userId,
        "Only the named participant can decide for this seat.",
      );
      insist(
        parsed.data.kind !== "withdraw" || seat.decision?.kind === "agree",
        "Only an agreed participant can withdraw.",
      );
      const at = new Date().toISOString();
      seat.decision = {
        kind: parsed.data.kind,
        actorId: auth.userId,
        reason: parsed.data.reason,
        at,
      };
      const concerns = [...agreement.concerns];
      if (parsed.data.kind !== "agree")
        concerns.push({
          id: randomUUID(),
          author: auth.userId,
          seat: parsed.data.seat,
          generation: seat.generation,
          reason: parsed.data.reason,
          openedAt: at,
          resolution: null,
        });
      await tx
        .update(requestAgreements)
        .set({
          seats: { ...agreement.seats, [parsed.data.seat]: seat },
          concerns,
        })
        .where(
          and(
            eq(requestAgreements.requestId, request.id),
            eq(requestAgreements.orgId, auth.orgId),
          ),
        );
    },
  );
}

import { requireActiveMember, requireMemberOrAbove } from "@/lib/auth-guard";
import { measurementReadiness } from "@/lib/request-measurement";
import { expectedImpactSchema } from "@/lib/request-impact";
export async function resolveAgreementConcern(
  context: AgreementContext,
  input: unknown,
) {
  const parsed = z
    .object({ concernId: z.uuid(), reason: z.string().trim().min(1).max(4000) })
    .strict()
    .safeParse(input);
  if (!parsed.success) return { error: "Give a resolution reason." };
  return mutateAgreement(
    context,
    parsed.data,
    "concern_resolved",
    false,
    async (tx, request, agreement, auth) => {
      insist(agreement?.snapshot, "Agreement has not been submitted.");
      const concern = agreement.concerns.find(
        (c) => c.id === parsed.data.concernId,
      );
      insist(
        concern && !concern.resolution,
        "This concern is unavailable or already resolved.",
      );
      const seat = agreement.seats[concern.seat];
      const members = await agreementRoster(auth.orgId);
      insist(
        members.some(
          (p) =>
            p.nominee.kind === "member" && p.nominee.userId === auth.userId,
        ),
        "Your membership is no longer active.",
      );
      let replacementOfUnavailableAuthor = false;
      if (
        seat &&
        seat.generation > concern.generation &&
        seat.nominee.kind === "member" &&
        seat.nominee.userId === auth.userId
      ) {
        const events = await tx
          .select()
          .from(requestAgreementEvents)
          .where(
            and(
              eq(requestAgreementEvents.requestId, request.id),
              eq(requestAgreementEvents.orgId, auth.orgId),
              eq(requestAgreementEvents.kind, "participant_replaced"),
            ),
          );
        replacementOfUnavailableAuthor = events.some((event) => {
          const input = replacementParticipantSchema.safeParse(
            event.payload.input,
          );
          const before = event.payload.before as AgreementRow | null;
          const previous = before?.seats[concern.seat];
          return (
            input.success &&
            input.data.unavailable &&
            input.data.seat === concern.seat &&
            previous?.generation === concern.generation &&
            previous.nominee.kind === "member" &&
            previous.nominee.userId === concern.author
          );
        });
      }
      insist(
        auth.userId === concern.author || replacementOfUnavailableAuthor,
        "Only the concern author or their replacement when unavailable can resolve this concern.",
      );
      concern.resolution = {
        actorId: auth.userId,
        reason: parsed.data.reason,
        resolvedAt: new Date().toISOString(),
      };
      await tx
        .update(requestAgreements)
        .set({ concerns: agreement.concerns })
        .where(
          and(
            eq(requestAgreements.requestId, request.id),
            eq(requestAgreements.orgId, auth.orgId),
          ),
        );
    },
  );
}
export async function replaceAgreementParticipant(
  context: AgreementContext,
  input: unknown,
) {
  const parsed = replacementParticipantSchema.safeParse(input);
  if (!parsed.success)
    return { error: "Choose a replacement and give a reason." };
  return mutateAgreement(
    context,
    parsed.data,
    "participant_replaced",
    true,
    async (tx, request, agreement, auth) => {
      insist(
        agreement?.snapshot,
        "Submit the commitment before replacing a participant.",
      );
      const people = [
        ...(await agreementRoster(auth.orgId)),
        ...(await agreementInvitations(auth.orgId)),
      ];
      const person = people.find(
        (p) => nomineeKey(p.nominee) === nomineeKey(parsed.data.nominee),
      );
      insist(person, "This participant is unavailable.");
      for (const d of disciplines) {
        if (d === parsed.data.seat) continue;
        const nominee = agreement.seats[d]?.nominee;
        const other =
          nominee &&
          people.find((p) => nomineeKey(p.nominee) === nomineeKey(nominee));
        insist(
          !other ||
            ((!person.email || other.email !== person.email) &&
              nomineeKey(other.nominee) !== nomineeKey(person.nominee)),
          "Choose three distinct people.",
        );
      }
      insist(
        await distinctAgreementPeople([
          person,
          ...disciplines.flatMap((d) => {
            if (d === parsed.data.seat) return [];
            const n = agreement.seats[d]?.nominee;
            const p =
              n && people.find((p) => nomineeKey(p.nominee) === nomineeKey(n));
            return p ? [p] : [];
          }),
        ]),
        "Choose three distinct people.",
      );
      const previous = agreement.seats[parsed.data.seat];
      insist(
        !previous ||
          nomineeKey(previous.nominee) !== nomineeKey(person.nominee),
        "Choose a different participant.",
      );
      await tx
        .update(requestAgreements)
        .set({
          seats: {
            ...agreement.seats,
            [parsed.data.seat]: {
              generation: (previous?.generation ?? 0) + 1,
              nominee: person.nominee,
              decision: null,
              displayNameAtSelection: person.name,
            },
          },
        })
        .where(
          and(
            eq(requestAgreements.requestId, request.id),
            eq(requestAgreements.orgId, auth.orgId),
          ),
        );
    },
  );
}
export async function addAgreementCorrection(
  context: AgreementContext,
  input: unknown,
) {
  const parsed = z
    .object({
      field: z.enum([
        "title",
        "description",
        "reframedProblem",
        "observedEvidence",
        "uncertainty",
        "extractedSolution",
      ]),
      wording: z.string().trim().min(1).max(4000),
      reason: z.string().trim().min(1).max(4000),
    })
    .strict()
    .safeParse(input);
  if (!parsed.success)
    return {
      error:
        "Choose a prose field and explain the correction. Material changes require a replacement.",
    };
  return mutateAgreement(
    context,
    parsed.data,
    "correction_added",
    true,
    async (_tx, _request, agreement) => {
      insist(
        agreement?.snapshot,
        "Submit agreement before adding a correction.",
      );
    },
  );
}
export async function createAgreementReplacement(
  context: AgreementContext,
  input: unknown,
) {
  const parsed = z
    .object({ reason: z.string().trim().min(1).max(4000) })
    .strict()
    .safeParse(input);
  if (!parsed.success)
    return { error: "Explain why the commitment needs a replacement." };
  return mutateAgreement(
    context,
    parsed.data,
    "replacement_created",
    true,
    async (tx, request, agreement, auth) => {
      insist(
        agreement?.snapshot,
        "Only a submitted commitment needs a linked replacement.",
      );
      const incoming = (
        await tx
          .select()
          .from(requestReplacements)
          .where(
            and(
              eq(requestReplacements.replacementId, request.id),
              eq(requestReplacements.orgId, auth.orgId),
            ),
          )
      )[0];
      insist(
        !incoming || incoming.confirmedAt,
        "Confirm the original as Superseded first.",
      );
      const existing = (
        await tx
          .select()
          .from(requestReplacements)
          .where(
            and(
              eq(requestReplacements.originalId, request.id),
              eq(requestReplacements.orgId, auth.orgId),
            ),
          )
      )[0];
      insist(!existing, "A replacement already exists. Open it to continue.");
      // Copy only previously confirmed text. Changed text uses the existing signed AI gate in Edit Request.
      const [successor] = await tx
        .insert(requests)
        .values({
          ...commitmentValues(request),
          priority: request.priority,
          orgId: auth.orgId,
          createdBy: auth.userId,
          measurementDraft: request.measurementDraft,
        })
        .returning({ id: requests.id });
      const seats: AgreementSeats = {
        pm: null,
        designer: null,
        developer: null,
      };
      for (const d of disciplines) {
        const old = agreement.seats[d];
        if (old) seats[d] = { ...old, generation: 1, decision: null };
      }
      await tx
        .insert(requestAgreements)
        .values({
          orgId: auth.orgId,
          requestId: successor.id,
          prepared: agreement.prepared,
          seats,
          concerns: agreement.concerns
            .filter((c) => !c.resolution)
            .map((c) => ({ ...c, id: randomUUID(), generation: 1 })),
        });
      await tx
        .insert(requestReplacements)
        .values({
          originalId: request.id,
          replacementId: successor.id,
          orgId: auth.orgId,
          createdBy: auth.userId,
          reason: parsed.data.reason,
          changedFields: [],
        });
      return { replacementId: successor.id };
    },
  );
}
export async function confirmRequestSuperseded(
  context: AgreementContext,
  input: unknown,
) {
  const parsed = z
    .object({
      replacementId: z.uuid(),
      reason: z.string().trim().min(1).max(4000),
    })
    .strict()
    .safeParse(input);
  if (!parsed.success)
    return { error: "Choose the replacement and give a superseding reason." };
  return mutateAgreement(
    context,
    parsed.data,
    "superseded",
    true,
    async (tx, request, agreement, auth) => {
      insist(agreement?.snapshot, "This Request has no submitted commitment.");
      const [link] = await tx
        .select()
        .from(requestReplacements)
        .where(
          and(
            eq(requestReplacements.originalId, request.id),
            eq(requestReplacements.orgId, auth.orgId),
          ),
        );
      insist(
        link && link.replacementId === parsed.data.replacementId,
        "Replacement unavailable.",
      );
      const [replacement] = await tx
        .select()
        .from(requests)
        .where(
          and(
            eq(requests.id, link.replacementId),
            eq(requests.orgId, auth.orgId),
          ),
        );
      insist(
        replacement &&
          !replacement.exceptionClosure &&
          replacement.createdBy === auth.userId,
        "Replacement is unavailable or already closed.",
      );
      const incoming = (
        await tx
          .select()
          .from(requestReplacements)
          .where(
            and(
              eq(requestReplacements.replacementId, request.id),
              eq(requestReplacements.orgId, auth.orgId),
            ),
          )
      )[0];
      insist(
        !incoming || incoming.confirmedAt,
        "Confirm the original as Superseded first.",
      );
      const [nextAgreement] = await tx
        .select()
        .from(requestAgreements)
        .where(
          and(
            eq(requestAgreements.requestId, replacement.id),
            eq(requestAgreements.orgId, auth.orgId),
          ),
        );
      insist(nextAgreement, "Prepare the replacement before superseding.");
      const affectedFields = changedFields(
        agreement.snapshot,
        nextAgreement.snapshot?.request ?? commitmentValues(replacement),
        nextAgreement.snapshot?.prepared ?? nextAgreement.prepared,
      );
      insist(
        affectedFields.length,
        "Update the affected values in the replacement before superseding.",
      );
      const closedAt = new Date();
      await tx
        .update(requestReplacements)
        .set({
          confirmedBy: auth.userId,
          confirmedAt: closedAt,
          changedFields: affectedFields,
        })
        .where(
          and(
            eq(requestReplacements.originalId, request.id),
            eq(requestReplacements.orgId, auth.orgId),
          ),
        );
      return {
        replacementId: replacement.id,
        closure: {
          version: 1,
          kind: "exception",
          reasonCode: "superseded",
          reason: parsed.data.reason,
          actorId: auth.userId,
          closedAt: closedAt.toISOString(),
          replacementId: replacement.id,
        },
      };
    },
  );
}
