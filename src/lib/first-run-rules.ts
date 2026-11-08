import { FREE_REQUESTS, freeRequestsSharedNote, freeRequestsUsedReason, type FreeRequests, type PlanState } from "./free-request-rules";

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

/**
 * A220 (decided 2026-11-08): going Back to `step` marks it and every step after it unread, so the "first unread step"
 * rule above reopens the guide at the step the person went back to. The steps before it stay as they were. Null
 * when the step isn't one of the first Request guide's.
 */
export function backTo(guide: FirstRunGuide, steps: string[], step: string): FirstRequestStep[] | null {
  if (guide !== "first_request") return null;
  const at = FIRST_REQUEST_STEPS.indexOf(step as FirstRequestStep);
  if (at < 0) return null;
  return FIRST_REQUEST_STEPS.slice(0, at).filter((candidate) => steps.includes(candidate));
}

/** The Free Requests in one line, as the first run shows them. */
export function freeRequestsNote(planState: PlanState, free: FreeRequests): string {
  if (planState === "paying") return "This workspace pays for Lane, so creating Requests has no limit.";
  if (free.usedElsewhere) return freeRequestsSharedNote(free) ?? freeRequestsUsedReason(free);
  return `${free.left} of ${FREE_REQUESTS} Free Requests left.`;
}

/** What the first run's one action accepts: a step read, going Back to a step, skip, finish, or reopen from help. */
export type FirstRunChange = { change: "step"; step: FirstRunStep } | { change: "back"; step: FirstRequestStep } | { change: "skip" | "finish" | "reopen" };

const ALL_STEPS: readonly string[] = [...FIRST_REQUEST_STEPS, ...JOINED_STEPS];

/**
 * Reads the action's input; null for anything else, extra keys included. Written by hand rather than with zod so the
 * guide, which shares this module, keeps zod out of the Requests list's first load.
 */
export function parseFirstRunChange(data: unknown): FirstRunChange | null {
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;
  const input = data as Record<string, unknown>;
  const keys = Object.keys(input);
  if (input.change === "step")
    return keys.length === 2 && typeof input.step === "string" && ALL_STEPS.includes(input.step) ? { change: "step", step: input.step as FirstRunStep } : null;
  if (input.change === "back")
    return keys.length === 2 && typeof input.step === "string" && (FIRST_REQUEST_STEPS as readonly string[]).includes(input.step) ? { change: "back", step: input.step as FirstRequestStep } : null;
  if ((input.change === "skip" || input.change === "finish" || input.change === "reopen") && keys.length === 1) return { change: input.change };
  return null;
}
