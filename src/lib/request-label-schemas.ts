import { z } from "zod";
import { REQUEST_TYPES } from "./request-constants";
import { LABEL_COLOURS } from "./request-labels";
/**
 * The label schemas for server actions and the New Request form. Kept apart from the plain rules in
 * request-labels.ts, which the Requests list's rows import, so the list's browser code carries no zod (#266).
 */
export const labelKeysSchema = z.array(z.union([z.enum(REQUEST_TYPES), z.uuid()])).max(20).refine(keys => new Set(keys).size === keys.length, "Choose each label only once").optional();
export const labelInputSchema = z.object({
  name: z.string().transform(name => name.trim().replace(/\s+/g, " ")).pipe(z.string().min(1, "Label name is required").max(80, "Use at most 80 characters")),
  colour: z.enum(LABEL_COLOURS),
  projectId: z.uuid().nullable().optional(),
});
