import { sourceRequestType } from "./request-labels";
import { labelKeysSchema } from "./request-label-schemas";
import { z } from "zod";
import { newRequestImpactSchema } from "./request-impact";
import { projectIdSchema, requestPrioritySchema, requestTypeSchema } from "./request-properties";
import { measurementRequestTypeIssue } from "./request-measurement";

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
  labelKeys: labelKeysSchema,
  priority: requestPrioritySchema.default("none"),
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
  expectedImpact: newRequestImpactSchema,
}).superRefine((value, context) => {
  const issue = measurementRequestTypeIssue(value.expectedImpact, sourceRequestType(value));
  if (issue) context.addIssue({ code: "custom", path: ["expectedImpact", "primary", "noBaseline"], message: issue });
});

export type RequestInput = z.input<typeof requestSchema>;

/**
 * What a Guest files (#212): the same Request without a prediction. A Member who takes the Guest submission on
 * writes it. Any Expected impact sent with it is dropped, never saved.
 */
const { expectedImpact: _prediction, ...guestShape } = requestSchema.shape;
void _prediction;
export const guestRequestSchema = z.object(guestShape);

/** The schema a person's new Request is checked with: a Guest's has no prediction. */
export const newRequestSchemaFor = (withoutPrediction: boolean) => withoutPrediction ? guestRequestSchema : requestSchema;

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

/** A Request's optional context, in the order the composer and detail show it. */
export const REQUEST_CONTEXT_FIELDS = ["affectedPeople", "desiredChange", "observedEvidence", "uncertainty", "usefulLink"] as const;
export type RequestContextField = (typeof REQUEST_CONTEXT_FIELDS)[number];

/** Every field a person writes when composing a Request (requestSchema). */
export const REQUEST_SOURCE_FIELDS = ["expectedImpact", "projectId", "requestType", "priority", "title", "description", ...REQUEST_CONTEXT_FIELDS] as const;
export type RequestSourceField = (typeof REQUEST_SOURCE_FIELDS)[number];

/** The source field a validation issue belongs to, so the composer can focus it. */
export function sourceFieldOf(path: readonly PropertyKey[]): RequestSourceField | undefined {
  const [first] = path;
  return REQUEST_SOURCE_FIELDS.find((field) => field === first);
}

/** Context as it is saved: an empty field is stored as null. */
export function storedContext(source: Partial<Record<RequestContextField, string | null>>): Record<RequestContextField, string | null> {
  return Object.fromEntries(REQUEST_CONTEXT_FIELDS.map((field) => [field, source[field] || null])) as Record<RequestContextField, string | null>;
}

/** Context as the composer edits it: a missing value is an empty field. */
export function formContext(row: Partial<Record<RequestContextField, string | null>>): Record<RequestContextField, string> {
  return Object.fromEntries(REQUEST_CONTEXT_FIELDS.map((field) => [field, row[field] ?? ""])) as Record<RequestContextField, string>;
}
