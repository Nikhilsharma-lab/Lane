import { labelKeysSchema, sourceRequestType } from "./request-labels";
import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { expectedImpactSchema, noMeasurableImpactSchema } from "./request-impact";
import { projectIdSchema, requestPrioritySchema, requestTypeSchema } from "./request-properties";
import { measurementRequestTypeIssue } from "./request-measurement";

import type { TriageResult } from "@/lib/ai/triage";
import {
  CONTEXT_MAX,
  DESCRIPTION_MAX,
  TITLE_MAX,
  USEFUL_LINK_MAX,
  type RequestInput,
} from "@/lib/request-schema";

/**
 * Server-signed review state for the Intake gate.
 *
 * The browser may display the AI result and edit only the problem framing.
 * Classification, source content, preserved solution, request identity,
 * workspace, and person remain locked inside this token. The deterministic
 * request ID makes a repeated save idempotent.
 */

/** A reviewed impact: a measured plan, or the "No measurable impact" choice with its reason (#153). */
const reviewedImpactSchema = z.union([expectedImpactSchema, noMeasurableImpactSchema]);

const tokenPayloadSchema = z.object({
  requestId: z.string().uuid(),
  purpose: z.enum(["create", "edit"]).default("create"),
  orgId: z.string().min(1),
  userId: z.string().min(1),
  expectedImpact: reviewedImpactSchema.nullable().default(null),
  projectId: projectIdSchema,
  requestType: requestTypeSchema,
  labelKeys: labelKeysSchema,
  priority: requestPrioritySchema.default("none"),
  title: z.string().min(1).max(TITLE_MAX),
  description: z.string().min(1).max(DESCRIPTION_MAX),
  affectedPeople: z.string().max(CONTEXT_MAX),
  desiredChange: z.string().max(CONTEXT_MAX),
  observedEvidence: z.string().max(CONTEXT_MAX),
  uncertainty: z.string().max(CONTEXT_MAX),
  usefulLink: z.string().max(USEFUL_LINK_MAX),
  classification: z.enum(["problem", "solution", "hybrid"]),
  extractedSolution: z.string().max(DESCRIPTION_MAX).nullable(),
  issuedAt: z.number().int().nonnegative(),
});

export type TriageTokenPayload = z.infer<typeof tokenPayloadSchema>;

export type TriageTokenVerification =
  | { valid: true; payload: TriageTokenPayload }
  | { valid: false; reason: "invalid" | "expired" | "context_mismatch" | "impact_required" };

const TOKEN_MAX_AGE_MS = 10 * 60 * 1000;
const CLOCK_SKEW_MS = 60 * 1000;

function getSecret(): string {
  const secret = process.env.TRIAGE_TOKEN_SECRET;
  if (!secret) {
    throw new Error(
      "[triage-token] TRIAGE_TOKEN_SECRET is required for signing triage tokens"
    );
  }
  return secret;
}

function encode(payload: TriageTokenPayload): string {
  return Buffer.from(JSON.stringify(payload)).toString("base64url");
}

function signature(encoded: string): Buffer {
  return createHmac("sha256", getSecret()).update(encoded).digest();
}

function sign(payload: TriageTokenPayload): string {
  const encoded = encode(payload);
  return `${encoded}.${signature(encoded).toString("base64url")}`;
}

export function createTriageToken(
  input: RequestInput,
  triage: TriageResult,
  context: { orgId: string; userId: string },
  existingRequestId?: string
): string {
  return sign({
    requestId: existingRequestId ?? randomUUID(),
    purpose: existingRequestId ? "edit" : "create",
    orgId: context.orgId,
    userId: context.userId,
    // A Guest's new Request carries no prediction (#212); everyone else's must.
    expectedImpact: existingRequestId || input.expectedImpact == null ? reviewedImpactSchema.safeParse(input.expectedImpact).data ?? null : reviewedImpactSchema.parse(input.expectedImpact),
    projectId: input.projectId ?? null,
    requestType: sourceRequestType(input),
    labelKeys: input.labelKeys,
    priority: input.priority ?? "none",
    title: input.title,
    description: input.description,
    affectedPeople: input.affectedPeople,
    desiredChange: input.desiredChange,
    observedEvidence: input.observedEvidence,
    uncertainty: input.uncertainty,
    usefulLink: input.usefulLink,
    classification: triage.classification,
    extractedSolution: triage.extractedSolution,
    issuedAt: Date.now(),
  });
}

export function verifyTriageToken(
  token: string,
  context: { orgId: string; userId: string; withoutPrediction?: boolean },
  existingRequestId?: string
): TriageTokenVerification {
  const [encoded, suppliedSignature, ...extra] = token.split(".");
  if (!encoded || !suppliedSignature || extra.length > 0) {
    return { valid: false, reason: "invalid" };
  }

  let supplied: Buffer;
  try {
    supplied = Buffer.from(suppliedSignature, "base64url");
  } catch {
    return { valid: false, reason: "invalid" };
  }

  const expected = signature(encoded);
  if (
    supplied.length !== expected.length ||
    !timingSafeEqual(supplied, expected)
  ) {
    return { valid: false, reason: "invalid" };
  }

  try {
    const decoded = JSON.parse(
      Buffer.from(encoded, "base64url").toString("utf8")
    );
    const parsed = tokenPayloadSchema.safeParse(decoded);
    if (!parsed.success) return { valid: false, reason: "invalid" };

    const age = Date.now() - parsed.data.issuedAt;
    if (age > TOKEN_MAX_AGE_MS || age < -CLOCK_SKEW_MS) {
      return { valid: false, reason: "expired" };
    }

    if (
      parsed.data.orgId !== context.orgId ||
      parsed.data.userId !== context.userId
    ) {
      return { valid: false, reason: "context_mismatch" };
    }

    // A review redeems only for what it was issued for: an edit review for
    // its own Request, a new-Request review only for creating one.
    if ((parsed.data.purpose === "edit") !== (existingRequestId !== undefined)) return { valid: false, reason: "context_mismatch" };
    if (parsed.data.purpose === "edit") {
      if (parsed.data.requestId !== existingRequestId) return { valid: false, reason: "context_mismatch" };
      return { valid: true, payload: parsed.data };
    }
    // A Guest files without a prediction (#212): theirs is never saved, whatever the review held.
    if (context.withoutPrediction) return { valid: true, payload: { ...parsed.data, expectedImpact: null } };
    if (parsed.data.expectedImpact === null) return { valid: false, reason: "impact_required" };
    if (measurementRequestTypeIssue(parsed.data.expectedImpact, parsed.data.requestType)) return { valid: false, reason: "invalid" };
    return { valid: true, payload: parsed.data };
  } catch {
    return { valid: false, reason: "invalid" };
  }
}
