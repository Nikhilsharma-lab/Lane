import { z } from "zod";
import { REQUEST_PRIORITIES, REQUEST_TYPES } from "@/lib/request-constants";

// Client-safe shared values; project permissions stay in guarded server code.
// The constants and labels live in request-constants.ts (no Zod import, plan
// item 1.13) and are re-exported here for server code and older imports.
export {
  REQUEST_TYPES, REQUEST_TYPE_LABELS, REQUEST_TYPE_DESCRIPTIONS,
  REQUEST_PRIORITIES, REQUEST_PRIORITY_LABELS,
  type RequestType, type RequestPriority, type ProjectOption,
} from "@/lib/request-constants";
export const requestPrioritySchema = z.enum(REQUEST_PRIORITIES, "Choose a valid priority");
export const projectIdSchema = z.string().uuid("Choose a valid Project").nullable().default(null);
export const requestTypeSchema = z.enum(REQUEST_TYPES, "Choose a valid Request type").nullable().default(null);
export const projectInputSchema = z.object({
  name: z.string().transform((name) => name.trim().replace(/\s+/g, " ")).pipe(z.string().min(1, "Project name is required").max(80, "Use at most 80 characters for the Project name")),
  description: z.string().trim().max(300, "Use at most 300 characters for the Project description").nullish().transform((description) => description || null),
});
