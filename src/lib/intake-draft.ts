import { labelKeysSchema } from "./request-labels";
import { z } from "zod";
import { expectedImpactDraftSchema, hasImpactWork } from "./request-impact";
import { projectIdSchema, requestPrioritySchema, requestTypeSchema } from "./request-properties";
import { MAX_REVIEWERS, nomineeSchema, REVIEW_NOTE_MAX } from "./request-agreement";

import type { TriageResult } from "@/lib/ai/triage";
import {
  CONTEXT_MAX,
  DESCRIPTION_MAX,
  TITLE_MAX,
  USEFUL_LINK_MAX,
  type RequestInput,
} from "@/lib/request-schema";
import {
  INTAKE_DRAFT_CLOCK_SKEW_MS as CLOCK_SKEW_MS,
  INTAKE_DRAFT_MAX_AGE_MS,
  INTAKE_DRAFT_VERSION,
  intakeDraftStorageKey,
} from "./intake-draft-key";

export { hasIntakeDraft, intakeDraftScope, intakeDraftStorageKey } from "./intake-draft-key";
// Covers every bounded source/impact/AI field even when JSON uses six-byte
// escapes per character and base64 expands it again. The former 20k limit
// discarded valid long reviews on recovery.
const REVIEW_TOKEN_MAX_LENGTH = 256_000;

type DraftStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

const sourceSchema = z.object({
  expectedImpact: expectedImpactDraftSchema,
  projectId: projectIdSchema,
  requestType: requestTypeSchema,
  labelKeys: labelKeysSchema,
  priority: requestPrioritySchema.default("none"),
  title: z.string().max(TITLE_MAX),
  description: z.string().max(DESCRIPTION_MAX),
  affectedPeople: z.string().max(CONTEXT_MAX).default(""),
  desiredChange: z.string().max(CONTEXT_MAX).default(""),
  observedEvidence: z.string().max(CONTEXT_MAX).default(""),
  uncertainty: z.string().max(CONTEXT_MAX).default(""),
  usefulLink: z.string().max(USEFUL_LINK_MAX).default(""),
});

const triageDraftSchema = z
  .object({
    classification: z.enum(["problem", "solution", "hybrid"]),
    reframedProblem: z.string().max(DESCRIPTION_MAX).nullable(),
    extractedSolution: z.string().max(DESCRIPTION_MAX).nullable(),
  })
  .superRefine((value, context) => {
    if (
      value.classification === "problem" &&
      (value.reframedProblem !== null || value.extractedSolution !== null)
    ) {
      context.addIssue({
        code: "custom",
        message: "Problem drafts cannot include generated framing.",
      });
    }

    if (
      value.classification === "solution" &&
      (value.reframedProblem === null || value.extractedSolution !== null)
    ) {
      context.addIssue({
        code: "custom",
        message: "Solution drafts require only a reframed problem.",
      });
    }

    if (
      value.classification === "hybrid" &&
      (value.reframedProblem === null || value.extractedSolution === null)
    ) {
      context.addIssue({
        code: "custom",
        message: "Hybrid drafts require a problem and preserved solution.",
      });
    }
  });

/** Reviewers picked on the compose step and the question they are sent. The server checks every rule again on create. */
const reviewersDraftSchema = z.object({
  people: z.array(z.object({
    nominee: nomineeSchema,
    name: z.string().max(320),
    email: z.string().max(320),
    role: z.string().max(100).optional(),
  })).max(MAX_REVIEWERS),
  question: z.string().max(REVIEW_NOTE_MAX),
});
export type ReviewersDraft = z.infer<typeof reviewersDraftSchema>;

const intakeDraftSchema = z.object({
  version: z.literal(INTAKE_DRAFT_VERSION),
  savedAt: z.number().int().nonnegative(),
  source: sourceSchema,
  previousProblem: z.string().max(DESCRIPTION_MAX).default(""),
  previousProblemSource: z.object({
    title: z.string().max(TITLE_MAX),
    description: z.string().max(DESCRIPTION_MAX),
  }).nullable().optional(),
  review: z
    .object({
      triage: triageDraftSchema,
      token: z.string().min(1).max(REVIEW_TOKEN_MAX_LENGTH),
      editedProblem: z.string().max(DESCRIPTION_MAX),
    })
    .nullable(),
  // Older drafts have none; unreadable picks are dropped without losing the text.
  reviewers: reviewersDraftSchema.optional().catch(undefined),
});

export type IntakeDraft = {
  version: typeof INTAKE_DRAFT_VERSION;
  savedAt: number;
  source: RequestInput;
  previousProblem?: string;
  previousProblemSource?: Pick<RequestInput, "title" | "description"> | null;
  review: {
    triage: TriageResult;
    token: string;
    editedProblem: string;
  } | null;
  reviewers?: ReviewersDraft;
};

export function readIntakeDraft(
  storage: DraftStorage,
  scope: string,
  now = Date.now()
): IntakeDraft | null {
  const key = intakeDraftStorageKey(scope);

  try {
    const raw = storage.getItem(key);
    if (!raw) return null;

    const parsed = intakeDraftSchema.safeParse(JSON.parse(raw));
    if (
      !parsed.success ||
      now - parsed.data.savedAt > INTAKE_DRAFT_MAX_AGE_MS ||
      parsed.data.savedAt - now > CLOCK_SKEW_MS
    ) {
      storage.removeItem(key);
      return null;
    }

    return parsed.data;
  } catch {
    try {
      storage.removeItem(key);
    } catch {
      // Storage can be unavailable in privacy-restricted browser contexts.
    }
    return null;
  }
}

export function writeIntakeDraft(
  storage: DraftStorage,
  scope: string,
  draft: Omit<IntakeDraft, "version" | "savedAt">,
  now = Date.now()
): boolean {
  const key = intakeDraftStorageKey(scope);
  // The default unit is not user work. An open guardrail pane, an added
  // guardrail or an explicitly cleared/custom unit is.
  const hasImpact = hasImpactWork(draft.source.expectedImpact);
  const hasSource =
    hasImpact ||
    Boolean(draft.previousProblem?.trim()) ||
    draft.source.projectId != null ||
    draft.source.requestType != null ||
    (draft.source.labelKeys?.length ?? 0) > 0 ||
    (draft.source.priority !== undefined && draft.source.priority !== "none") ||
    draft.source.title.trim().length > 0 ||
    draft.source.description.trim().length > 0 ||
    draft.source.affectedPeople.trim().length > 0 ||
    draft.source.desiredChange.trim().length > 0 ||
    draft.source.observedEvidence.trim().length > 0 ||
    draft.source.uncertainty.trim().length > 0 ||
    draft.source.usefulLink.trim().length > 0 ||
    (draft.reviewers?.people.length ?? 0) > 0 ||
    Boolean(draft.reviewers?.question.trim());

  try {
    if (!hasSource && draft.review === null) {
      storage.removeItem(key);
      return true;
    }

    storage.setItem(
      key,
      JSON.stringify({
        version: INTAKE_DRAFT_VERSION,
        savedAt: now,
        ...draft,
      } satisfies IntakeDraft)
    );
    return true;
  } catch {
    return false;
  }
}

export function clearIntakeDraft(
  storage: DraftStorage,
  scope: string
): void {
  try {
    storage.removeItem(intakeDraftStorageKey(scope));
  } catch {
    // Storage can be unavailable in privacy-restricted browser contexts.
  }
}
