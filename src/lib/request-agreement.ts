import { z } from "zod";
import type { Request } from "@/db/schema/requests";
export const disciplines = ["pm", "designer", "developer"] as const;
export const disciplineSchema = z.enum(disciplines);
export type Discipline = z.infer<typeof disciplineSchema>;
const text = z.string().trim().min(1).max(4000);
export const nomineeSchema = z.discriminatedUnion("kind", [
  z
    .object({ kind: z.literal("member"), userId: z.string().min(1).max(200) })
    .strict(),
  z
    .object({
      kind: z.literal("invitation"),
      invitationId: z.string().min(1).max(200),
      email: z.email().max(320),
    })
    .strict(),
]);
export type Nominee = z.infer<typeof nomineeSchema>;
export const preparedSchema = z
  .object({
    version: z.literal(1),
    scopeIncluded: text,
    scopeExcluded: text,
    audience: text,
    timing: text,
    constraints: text,
    feasibility: text,
    commitmentKind: z.enum(["discovery", "delivery"]),
  })
  .strict();
export type PreparedAgreement = z.infer<typeof preparedSchema>;
export type AgreementDecision = {
  kind: "agree" | "request_changes" | "withdraw";
  actorId: string;
  at: string;
  reason: string;
};
export type AgreementSeat = {
  generation: number;
  nominee: Nominee;
  decision: AgreementDecision | null;
  displayNameAtSelection: string;
};
export type AgreementSeats = Record<Discipline, AgreementSeat | null>;
export type AgreementConcern = {
  id: string;
  author: string;
  seat: Discipline;
  generation: number;
  reason: string;
  openedAt: string;
  resolution: null | { actorId: string; reason: string; resolvedAt: string };
};
export type AgreementSnapshot = {
  version: 1;
  request: Pick<
    Request,
    | "title"
    | "description"
    | "classification"
    | "reframedProblem"
    | "extractedSolution"
    | "affectedPeople"
    | "desiredChange"
    | "observedEvidence"
    | "uncertainty"
    | "usefulLink"
    | "requestType"
    | "projectId"
    | "labelKeys"
    | "expectedImpact"
  >;
  prepared: PreparedAgreement;
  attachmentIds: string[];
};
export type ExceptionClosure = {
  version: 1;
  kind: "exception";
  reasonCode: "superseded";
  reason: string;
  actorId: string;
  closedAt: string;
  replacementId: string;
};
export const agreementContextSchema = z
  .object({
    orgId: z.string().min(1),
    requestId: z.uuid(),
    expectedRevision: z.number().int().nonnegative(),
    operationId: z.uuid(),
  })
  .strict();
export type AgreementContext = z.infer<typeof agreementContextSchema>;
export const prepareAgreementSchema = z
  .object({
    prepared: preparedSchema,
    nominees: z
      .object({
        pm: nomineeSchema.nullable(),
        designer: nomineeSchema.nullable(),
        developer: nomineeSchema.nullable(),
      })
      .strict(),
    blockers: z
      .array(z.object({ seat: disciplineSchema, reason: text }).strict())
      .max(30),
  })
  .strict();
export function agreementBlockReason(
  agreement:
    | { snapshot: unknown; seats: AgreementSeats; concerns: AgreementConcern[] }
    | undefined
    | null,
): string | null {
  if (!agreement?.snapshot) return "Request agreement before picking up work.";
  if (agreement.concerns.some((c) => !c.resolution))
    return "Agreement blocked: resolve the recorded concerns.";
  const seats = disciplines.map((d) => agreement.seats[d]);
  if (
    seats.some(
      (s) => s?.nominee.kind !== "member" || s.decision?.kind !== "agree",
    )
  )
    return "Agreement blocked: all three participants must agree.";
  const ids = seats.map((s) =>
    s?.nominee.kind === "member" ? s.nominee.userId : "",
  );
  return new Set(ids).size === 3
    ? null
    : "Agreement requires three distinct people.";
}
export function commitmentValues(
  request: Request,
): AgreementSnapshot["request"] {
  const {
    title,
    description,
    classification,
    reframedProblem,
    extractedSolution,
    affectedPeople,
    desiredChange,
    observedEvidence,
    uncertainty,
    usefulLink,
    requestType,
    projectId,
    labelKeys,
    expectedImpact,
  } = request;
  return {
    title,
    description,
    classification,
    reframedProblem,
    extractedSolution,
    affectedPeople,
    desiredChange,
    observedEvidence,
    uncertainty,
    usefulLink,
    requestType,
    projectId,
    labelKeys,
    expectedImpact,
  };
}
