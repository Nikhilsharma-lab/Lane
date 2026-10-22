import type { TriageResult } from "@/lib/ai/triage";
import type { IntakeDraft, ReviewersDraft } from "@/lib/intake-draft";
import { requiredExpectedImpactSchema } from "@/lib/request-impact";
import type { RequestInput } from "@/lib/request-schema";
import type { UnfinishedUpload, UnfinishedUploads } from "@/lib/unfinished-uploads";

/** The composer steps a draft can be saved from or restored to. */
export type ComposerStage = "compose" | "checking" | "framing" | "creating" | "uploading" | "attachment_recovery" | "uploads_checking" | "uploads_lost" | "complete";

/** What the composer holds that a draft keeps. */
export type ComposerDraftState = {
  stage: ComposerStage;
  triage: TriageResult | null;
  token: string | null;
  editedProblem: string;
  /** The source the review was run on. */
  source: RequestInput | null;
  /** The form's values now. */
  values: RequestInput;
  previousProblem: string;
  previousProblemSource: Pick<RequestInput, "title" | "description"> | null;
  reviewers: ReviewersDraft | undefined;
};

/**
 * The draft to store for the composer as it stands. A review in progress
 * keeps its signed token with the source it was run on; otherwise the form's
 * values are kept with any earlier problem wording.
 */
export function composerDraft(state: ComposerDraftState): Omit<IntakeDraft, "version" | "savedAt"> {
  const review = (state.stage === "framing" || state.stage === "creating") && state.triage && state.token
    ? { triage: state.triage, token: state.token, editedProblem: state.editedProblem }
    : null;
  return {
    source: review && state.source ? state.source : state.values,
    review,
    previousProblem: state.editedProblem || state.previousProblem,
    previousProblemSource: state.previousProblemSource,
    reviewers: state.reviewers,
  };
}

/** The composer as a restored draft leaves it. */
export type RestoredComposer = {
  source: RequestInput;
  reviewers: ReviewersDraft["people"];
  reviewQuestion: string;
  previousProblem: string;
  previousProblemSource: Pick<RequestInput, "title" | "description"> | null;
  /** The review to resume at the framing step, or null for the compose step. */
  review: IntakeDraft["review"];
};

/**
 * The composer a stored draft restores. A stored review knows which text
 * produced its framing; an older compose draft may keep wording without an
 * origin, which is shown but never attached to a different Request. A review
 * resumes only while its Expected impact is still complete.
 */
export function restoredComposer(draft: IntakeDraft): RestoredComposer {
  const framed = draft.review && draft.review.triage.classification !== "problem";
  return {
    source: draft.source,
    reviewers: draft.reviewers?.people ?? [],
    reviewQuestion: draft.reviewers?.question ?? "",
    previousProblem: draft.previousProblem || draft.review?.editedProblem || "",
    previousProblemSource: framed ? { title: draft.source.title, description: draft.source.description } : draft.previousProblemSource ?? null,
    review: draft.review && requiredExpectedImpactSchema.safeParse(draft.source.expectedImpact).success ? draft.review : null,
  };
}

/**
 * After a reload interrupted uploads (plan item 2.3, S3): each reserved file
 * is cleared, and one that had in fact finished drops off the list. Returns
 * the files still not added, or none when every file had finished.
 */
export async function settleLostUploads(
  lost: UnfinishedUploads,
  discard: (input: { requestId: string; attachmentId: string }) => Promise<{ success: boolean; alreadyUploaded?: boolean }>,
): Promise<UnfinishedUpload[]> {
  const settled = await Promise.all(lost.files.map(async (file): Promise<UnfinishedUpload | null> => {
    const attachmentId = file.attachmentId;
    if (!attachmentId) return file;
    try {
      const result = await discard({ requestId: lost.requestId, attachmentId });
      if (result.success && result.alreadyUploaded) return null;
      return result.success ? { ...file, attachmentId: null } : file;
    } catch {
      return file;
    }
  }));
  return settled.filter((file): file is UnfinishedUpload => file !== null);
}
