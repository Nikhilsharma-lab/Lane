import { z } from "zod";

/**
 * Shared intake-form validation — the single source of truth for both the
 * client form (zodResolver) and the server actions (safeParse).
 *
 * MUST stay importable by client components: zod only — no "use server",
 * no db/auth/env imports.
 */

export const TITLE_MIN = 3;
export const TITLE_MAX = 200;
export const DESCRIPTION_MIN = 10;
export const DESCRIPTION_MAX = 5000;

export const requestSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1, "Title is required")
    .min(TITLE_MIN, `Please give this a short title — at least ${TITLE_MIN} characters`)
    .max(TITLE_MAX, `Title must be at most ${TITLE_MAX} characters`),
  description: z
    .string()
    .trim()
    .min(1, "Description is required")
    .min(DESCRIPTION_MIN, `Tell us a bit more — at least ${DESCRIPTION_MIN} characters`)
    .max(DESCRIPTION_MAX, `Description must be at most ${DESCRIPTION_MAX} characters`),
});

export type RequestInput = z.infer<typeof requestSchema>;

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
    `Problem framing needs at least ${DESCRIPTION_MIN} characters`
  )
  .max(
    DESCRIPTION_MAX,
    `Problem framing must be at most ${DESCRIPTION_MAX} characters`
  );

export const editedProblemSchema = problemFramingSchema.nullable();
