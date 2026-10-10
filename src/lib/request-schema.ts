import { z } from "zod";
import { requiredExpectedImpactSchema } from "./request-impact";
import { projectIdSchema, requestTypeSchema } from "./request-properties";

/**
 * Shared intake-form validation — the single source of truth for both the
 * client form (zodResolver) and the server actions (safeParse).
 *
 * MUST stay importable by client components: client-safe validation only — no "use server",
 * no db/auth/env imports.
 */

export const TITLE_MIN = 3;
export const TITLE_MAX = 200;
export const DESCRIPTION_MIN = 10;
export const DESCRIPTION_MAX = 5000;
export const CONTEXT_MAX = 3000;
export const USEFUL_LINK_MAX = 2048;

const optionalContextSchema = z
  .string()
  .trim()
  .max(
    CONTEXT_MAX,
    `Use at most ${CONTEXT_MAX} characters for each optional detail`
  );

const usefulLinkSchema = z
  .string()
  .trim()
  .max(USEFUL_LINK_MAX, "This link is too long")
  .refine(
    (value) => {
      if (value.length === 0) return true;
      if (!z.url().safeParse(value).success) return false;
      return new URL(value).protocol === "https:";
    },
    "Enter a complete link, including https://"
  );

export const requestSchema = z.object({
  projectId: projectIdSchema,
  requestType: requestTypeSchema,
  title: z
    .string()
    .trim()
    .min(1, "Title is required")
    .min(TITLE_MIN, `Use at least ${TITLE_MIN} characters for the title`)
    .max(TITLE_MAX, `Title must be at most ${TITLE_MAX} characters`),
  description: z
    .string()
    .trim()
    .min(1, "Description is required")
    .min(DESCRIPTION_MIN, `Use at least ${DESCRIPTION_MIN} characters for the description`)
    .max(DESCRIPTION_MAX, `Description must be at most ${DESCRIPTION_MAX} characters`),
  affectedPeople: optionalContextSchema,
  desiredChange: optionalContextSchema,
  observedEvidence: optionalContextSchema,
  uncertainty: optionalContextSchema,
  usefulLink: usefulLinkSchema,
  expectedImpact: requiredExpectedImpactSchema,
});

export type RequestInput = z.input<typeof requestSchema>;

/**
 * The user-editable problem framing submitted at save time. Nullable: null
 * means "problem-classified, nothing to edit". Solution and hybrid outcomes
 * parse through problemFramingSchema before save, so a forged action cannot
 * insert an empty or whitespace-only framing.
 */
export const problemFramingSchema = z
  .string()
  .trim()
  .min(
    DESCRIPTION_MIN,
    `Describe the problem in at least ${DESCRIPTION_MIN} characters`
  )
  .max(
    DESCRIPTION_MAX,
    `Use no more than ${DESCRIPTION_MAX} characters for the problem`
  );

export const editedProblemSchema = problemFramingSchema.nullable();
