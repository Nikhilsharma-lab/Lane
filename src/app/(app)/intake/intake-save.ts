import { callAction } from "@/lib/action-call";
import { requestEditSchema, type requestEditValues } from "@/lib/request-edit";
import type { RequestInput } from "@/lib/request-schema";
import type { TriageResult } from "@/lib/ai/triage";
import type { ReviewerChoice } from "@/components/requests/request-reviewers-picker";
import type { useOptimisticAction } from "@/components/requests/use-optimistic-action";
import { saveRequest, type SaveResponse } from "./actions";
import { saveRequestEdits } from "../requests/[id]/edit-actions";

type Review = { token: string | null; triage: TriageResult | null; editedProblem: string };

/** New sends the signed review, with advisory reviewer picks beside it. */
export function saveNewIntake(input: Review & { offerReviewers: boolean; reviewers: ReviewerChoice[]; reviewQuestion: string }, context: { orgId: string }): Promise<SaveResponse> {
  const payload = { token: input.token!, editedProblemText: input.triage?.classification === "problem" ? null : input.editedProblem };
  const picks = input.offerReviewers && input.reviewers.length
    ? { nominees: input.reviewers.map(person => person.nominee), note: input.reviewQuestion } : undefined;
  return callAction(() => saveRequest(payload, context, picks));
}

/** Edit keeps its saved snapshot and framing when the source wording is unchanged. */
export async function saveEditedIntake(input: Review & {
  requestId: string;
  source: RequestInput;
  original: ReturnType<typeof requestEditValues>;
  initialImpact: RequestInput["expectedImpact"];
  noMeasurableImpactReason: string | null;
  unchanged: boolean;
  savedProblem: string | null;
  savedSolution: string | null;
  snapshot: string;
}, context: { orgId: string }, optimistic: ReturnType<typeof useOptimisticAction>): Promise<SaveResponse> {
  const changes = { ...input.source,
    expectedImpact: input.original.expectedImpact === null && !input.noMeasurableImpactReason && JSON.stringify(input.source.expectedImpact) === JSON.stringify(input.initialImpact) ? null : input.source.expectedImpact,
    reframedProblem: input.unchanged ? input.savedProblem : input.triage?.classification === "problem" ? null : input.editedProblem,
    extractedSolution: input.unchanged ? input.savedSolution : input.triage?.extractedSolution ?? null,
  };
  const parsed = requestEditSchema.safeParse(changes);
  if (!parsed.success) return { success: false, error: { code: "save_failed", message: parsed.error.issues[0].message } };
  const outcome = await optimistic({ id: input.requestId, waitForPending: true, refreshOnError: false,
    run: () => saveRequestEdits(input.requestId, { snapshot: input.snapshot, changes: parsed.data, token: input.unchanged ? undefined : input.token ?? undefined }, context),
    onError: () => {},
  });
  return outcome.status === "success" ? { success: true, requestId: input.requestId }
    : { success: false, error: { code: "save_failed", message: outcome.status === "error" ? outcome.error : "This Request has a pending change. Try again." } };
}
