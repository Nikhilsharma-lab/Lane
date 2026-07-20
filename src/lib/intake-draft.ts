import { z } from "zod";

import type { TriageResult } from "@/lib/ai/triage";
import {
  DESCRIPTION_MAX,
  TITLE_MAX,
  type RequestInput,
} from "@/lib/request-schema";

const INTAKE_DRAFT_VERSION = 1;
const INTAKE_DRAFT_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const CLOCK_SKEW_MS = 60 * 1000;

type DraftStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

const sourceSchema = z.object({
  title: z.string().max(TITLE_MAX),
  description: z.string().max(DESCRIPTION_MAX),
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

const intakeDraftSchema = z.object({
  version: z.literal(INTAKE_DRAFT_VERSION),
  savedAt: z.number().int().nonnegative(),
  source: sourceSchema,
  review: z
    .object({
      triage: triageDraftSchema,
      token: z.string().min(1).max(20_000),
      editedProblem: z.string().max(DESCRIPTION_MAX),
    })
    .nullable(),
});

export type IntakeDraft = {
  version: typeof INTAKE_DRAFT_VERSION;
  savedAt: number;
  source: RequestInput;
  review: {
    triage: TriageResult;
    token: string;
    editedProblem: string;
  } | null;
};

export function intakeDraftScope(userId: string, orgId: string): string {
  return `${userId}:${orgId}`;
}

export function intakeDraftStorageKey(scope: string): string {
  return `lane:intake-draft:v${INTAKE_DRAFT_VERSION}:${scope}`;
}

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
  const hasSource =
    draft.source.title.trim().length > 0 ||
    draft.source.description.trim().length > 0;

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
