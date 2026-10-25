import { z } from "zod";
import { FREE_REQUESTS, freeRequestsUsedReason, type FreeRequests, type PlanState } from "./free-request-rules";

/**
 * #217 (spec #195, item 6): the first run, safe in the browser. The workspace's first person (its Clerk creator)
 * gets the first Request guide: the problem framing, a prediction from the Metrics library, Reviewers, the Free
 * Requests left, and what happens at Release and Result due, then files a first real Request. Everyone who joins
 * later gets a short first run that shows their Inbox. Anyone can skip it and find it again from help; progress
 * is kept per person per workspace (`first_run_progress`). There is no demo workspace and no sample data.
 */

export type FirstRunGuide = "first_request" | "joined";

/** The first Request guide's steps, in order. */
export const FIRST_REQUEST_STEPS = ["framing", "prediction", "reviewers", "free_requests", "release"] as const;
export type FirstRequestStep = (typeof FIRST_REQUEST_STEPS)[number];
/** The joined guide's one step. */
export const JOINED_STEPS = ["inbox"] as const;
export type FirstRunStep = FirstRequestStep | (typeof JOINED_STEPS)[number];

const STEPS: Record<FirstRunGuide, readonly FirstRunStep[]> = { first_request: FIRST_REQUEST_STEPS, joined: JOINED_STEPS };

/** A person's stored first run. */
export type FirstRunProgress = { guide: FirstRunGuide; steps: string[]; skippedAt: Date | null; completedAt: Date | null };

/** What the first run shows now; null when it is skipped, finished or not started. */
export type FirstRunView =
  | { guide: "first_request"; step: FirstRequestStep; read: FirstRequestStep[]; filed: boolean }
  | { guide: "joined" };

/** The workspace's first person is whoever created it in Clerk; everyone else joined later. */
export function firstRunGuideFor({ createdBy, userId }: { createdBy: string | null | undefined; userId: string }): FirstRunGuide {
  return createdBy && createdBy === userId ? "first_request" : "joined";
}

/** A creator who has already filed a Request (before first runs existed) starts with that guide finished. */
export function startingProgress({ guide, filed }: { guide: FirstRunGuide; filed: boolean }): { guide: FirstRunGuide; completed: boolean } {
  return { guide, completed: guide === "first_request" && filed };
}

export function firstRunView(progress: FirstRunProgress | null, { filed }: { filed: boolean }): FirstRunView | null {
  if (!progress || progress.skippedAt || progress.completedAt) return null;
  if (progress.guide === "joined") return { guide: "joined" };
  const read = FIRST_REQUEST_STEPS.filter((step) => progress.steps.includes(step));
  const step = FIRST_REQUEST_STEPS.find((candidate) => !read.includes(candidate)) ?? FIRST_REQUEST_STEPS[FIRST_REQUEST_STEPS.length - 1];
  return { guide: "first_request", step, read, filed };
}

/** `steps` with `step` read, in the guide's order; null when the step isn't this guide's. */
export function withStepRead(guide: FirstRunGuide, steps: string[], step: string): FirstRunStep[] | null {
  const own = STEPS[guide];
  if (!own.includes(step as FirstRunStep)) return null;
  return own.filter((candidate) => candidate === step || steps.includes(candidate));
}

/** The Free Requests in one line, as the first run shows them. */
export function freeRequestsNote(planState: PlanState, free: FreeRequests): string {
  if (planState === "paying") return "This workspace pays for Lane, so creating Requests has no limit.";
  if (free.usedElsewhere) return freeRequestsUsedReason(free);
  return `${free.left} of ${FREE_REQUESTS} Free Requests left.`;
}

/** What the first run's one action accepts: a step read, skip, finish, or reopen from help. */
export const firstRunChangeSchema = z.discriminatedUnion("change", [
  z.object({ change: z.literal("step"), step: z.enum([...FIRST_REQUEST_STEPS, ...JOINED_STEPS]) }).strict(),
  z.object({ change: z.literal("skip") }).strict(),
  z.object({ change: z.literal("finish") }).strict(),
  z.object({ change: z.literal("reopen") }).strict(),
]);
export type FirstRunChange = z.infer<typeof firstRunChangeSchema>;
