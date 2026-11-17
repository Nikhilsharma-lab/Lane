"use client";

import pickerLayout from "@/components/requests/request-picker-layout.module.css";
import { RequestLabels } from "@/components/requests/request-labels";
import { RequestLabelsPicker } from "@/components/requests/request-labels-picker";
import { requestLabelKeys, labelRequestType } from "@/lib/request-labels";
import Link from "@/components/link";
import { useStableRouter } from "@/components/shell/stable-router";
import {
  Fragment,
  memo,
  useCallback,
  useEffect,
  useEffectEvent,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  CheckIcon,
  InfoIcon,
  PlusIcon,
  LightbulbIcon,
  PaperclipIcon,
  RotateCcwIcon,
} from "lucide-react";
import { useToastStack } from "@/components/arc/toast-stack/toast-stack";

import { Button } from "@/components/arc/button/button";
import { Alert } from "@/components/arc/alert/alert";
import { Input } from "@/components/arc/input/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/arc/popover/popover";
import { Textarea } from "@/components/arc/textarea/textarea";
import { RadioCards } from "@/components/arc/radio-cards/radio-cards";
import { savedFraming, storedShape } from "@/lib/request-framing";
import { IntakeNavigationGuard, type RegisterIntakeCloseAttempt } from "@/components/requests/intake-navigation-guard";
import { IntakeAttachmentList } from "@/components/requests/intake-attachment-list";
import type { TriageResult } from "@/lib/ai/triage";
import {
  clearIntakeDraft,
  intakeDraftScope,
  readIntakeDraft,
  writeIntakeDraft,
} from "@/lib/intake-draft";
import {
  ATTACHMENT_ACCEPT,
  MAX_ATTACHMENT_FILES,
  validateAttachmentMetadata,
  validateAttachmentSelection,
} from "@/lib/request-attachments";
import {
  DESCRIPTION_MAX,
  problemFramingSchema,
  requestSchema,
  newRequestSchemaFor,
  TITLE_MAX,
  USEFUL_LINK_MAX,
  type RequestInput,
} from "@/lib/request-schema";
import { cn } from "@/lib/utils";
import type { OverviewRequest } from "@/lib/request-overview";
import { WORKSPACE_SWITCH_EVENT } from "@/lib/workspace-switch-guard";
import { clearUnfinishedUploads, readUnfinishedUploads, writeUnfinishedUploads } from "@/lib/unfinished-uploads";
import { usePendingMutationWriter } from "@/components/requests/pending-mutations-provider";
import { openShellSurface } from "@/components/shell/shell-openers";
import { requestCreatedToast } from "@/components/requests/request-created-toast";
import { ProjectPicker, RequestPriorityPicker, useWorkspaceProjects, pickerPopoverProps } from "@/components/requests/request-property-pickers";
import { RequestReviewersPicker, reviewerSummary, type ReviewerChoice } from "@/components/requests/request-reviewers-picker";
import { REQUEST_PRIORITY_LABELS } from "@/lib/request-constants";
import { expectedImpactDraftSchema, expectedImpactSchema, hasGuardrailEdits, NO_MEASURABLE_IMPACT_REASON_MAX, type ExpectedImpactDraft } from "@/lib/request-impact";
import { createEmptyMeasurementPlan } from "@/lib/request-measurement";
import { MeasurementPlanFields } from "@/components/requests/measurement-plan-fields";
import { ExpectedImpactSummary } from "@/components/requests/expected-impact-summary";
import { RequestReviewSupportingDetails } from "@/components/requests/request-review-supporting-details";

import type { RequestDetail } from "@/components/requests/detail-view";
import { editChangesContent, requestEditValues, requestEditSnapshot, requestEditSourceSchema } from "@/lib/request-edit";
import { framingChanges } from "@/lib/request-framing";
import { reviewResetWarning } from "@/lib/review-reset";
import { EMPTY_METRIC_IMPACT } from "@/lib/request-impact";
import { saveNewIntake, saveEditedIntake } from "./intake-save";
import { useOptimisticAction, useServerRefresh } from "@/components/requests/use-optimistic-action";

import styles from "./intake-form.module.css";
import { LimitedTextarea } from "./limited-text";

import {
  discardAttachmentUpload,
  finalizeAttachmentUpload,
  prepareAttachmentUpload,
} from "./attachment-actions";
import {
  runTriage,
  type IntakeFailure,
  type SaveResponse,
  type TriageResponse,
} from "./actions";
import { composerDraft, restoredComposer, reviewedRequestId } from "./intake-session";
import { createIntakeSession, uploadToSignedUrl, type QueuedAttachment } from "./intake-uploads";
import { gateFailureNotice, thrownGateFailure, type GateFailure } from "./gate-failure";
import { OFFLINE_LINE, TEXT_KEPT, isOfflineError } from "@/lib/failure-messages";
import { isOffline, useOffline } from "@/lib/connection-status";
import { callAction } from "@/lib/action-call";
import { Skeleton } from "@/components/arc/skeleton/skeleton";
import { Placeholder } from "@/components/loading/placeholder";
import { KeyCap } from "@/components/keyboard/key-caps";
import { FieldError } from "@/components/forms/field-error";

type Stage =
  | "compose"
  | "checking"
  | "framing"
  | "creating"
  | "uploading"
  | "attachment_recovery"
  | "uploads_checking"
  | "uploads_lost"
  | "complete";

const reveal =
  "motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-2 motion-safe:duration-200 motion-safe:ease-out";

/** The draft's Expected impact as the editors read it; an empty form starts a new measurement plan. */
const parseExpectedImpact = (value: unknown): ExpectedImpactDraft =>
  expectedImpactDraftSchema.parse(value) ?? createEmptyMeasurementPlan();
const hasText = (value: string | undefined) => Boolean(value);
/** The fields whose values the compose step renders; the title and description are never among them. */
const shownFields = ["affectedPeople", "desiredChange", "observedEvidence", "uncertainty", "projectId", "requestType", "priority", "labelKeys"] as const;

// The measurement editor (four Radix selects, a menu, number fields and a date dialog) is the
// largest part of the form. It renders only when its own value, the Request type or the step
// changes, and sits out the renders the rest of the form still does (a loaded Project list, a
// picker, a validation error).
const PlanFields = memo(MeasurementPlanFields);

const emptyRequest: RequestInput = {
  title: "",
  description: "",
  affectedPeople: "",
  desiredChange: "",
  observedEvidence: "",
  uncertainty: "",
  usefulLink: "",
  projectId: null,
  requestType: null,
  priority: "none",
  expectedImpact: createEmptyMeasurementPlan(),
};

/** #285 (C20): the Goal section's two choices, each saying what it means. */
const GOAL_CHOICES = [
  { value: "measure", label: "Measure a result", description: "A metric or a pass/fail check, compared after release." },
  { value: "none", label: "No measurable impact", description: "Operational work. Its reason is kept, and it is left out of every total." },
];

const earlierDraftFields = [
  { name: "affectedPeople", label: "Users" },
  // Plan item 2.5 (decision D5): the same words as Request detail.
  { name: "desiredChange", label: "Desired change" },
  { name: "observedEvidence", label: "Supporting information" },
  { name: "uncertainty", label: "Open questions" },
] as const;

function EarlierDraftDetails({
  values,
  error,
}: {
  values: Pick<RequestInput, (typeof earlierDraftFields)[number]["name"]>;
  error?: string;
}) {
  const details = earlierDraftFields.filter(({ name }) => values[name]);
  if (!details.length && !error) return null;

  return (
    <section
      id="intake-earlier-details"
      aria-labelledby="intake-earlier-details-heading"
      tabIndex={-1}
      className="space-y-3 border-t pt-4"
    >
      <div className="space-y-1">
        <h2 id="intake-earlier-details-heading" className="text-sm font-medium">
          Details from your earlier draft
        </h2>
        <p className="text-sm text-muted-foreground">
          These details will be included with your Request.
        </p>
      </div>
      <dl className="grid gap-4 text-sm sm:grid-cols-2">
        {details.map(({ name, label }) => (
          <div key={name} className="min-w-0 space-y-1">
            <dt className="font-medium">{label}</dt>
            <dd className="whitespace-pre-wrap break-words text-muted-foreground">
              {values[name]}
            </dd>
          </div>
        ))}
      </dl>
      {error && <p role="alert" className="text-destructive">{error}</p>}
    </section>
  );
}

// The review says when Lane's AI suggested the problem; a problem-shaped
// Request needs no line of its own.
const aiAttribution: Record<Exclude<TriageResult["classification"], "problem">, string> = {
  solution:
    "Lane’s AI suggested a problem to solve from your description. Edit anything that doesn’t match what you know.",
  hybrid:
    "Lane’s AI suggested a problem to solve from your description. Your suggested change will also be saved.",
};


/** #217: one line of the first-run guide, beside the part of the composer it explains. #285 (C25): it reads as a hint,
 * muted with an info icon, across the form's full width. */
function FirstRunHint({ children }: { children: React.ReactNode }) {
  return <p className={styles.hint} data-first-run-hint=""><InfoIcon data-icon-size="sm" aria-hidden="true" /><span>{children}</span></p>;
}

/** #285 (C1): the app frame's offline line, at the top of the composer, which covers the frame while it is open. */
function ComposerOfflineLine() {
  return <Alert open={useOffline()} tone="warning" title={OFFLINE_LINE} />;
}

function IntakeNotice({
  error = false,
  attention = false,
  title,
  children,
}: {
  error?: boolean;
  attention?: boolean;
  title?: string;
  children: React.ReactNode;
}) {
  // The restored-draft notice is not a live region. It arrives with its text
  // while focus moves, which NVDA and JAWS often skip, so the composer's
  // always-mounted live region says the restore once instead.
  return (
    <Alert tone={error ? "danger" : attention ? "warning" : "info"} role={attention ? "note" : undefined} title={title ?? (error ? "Action needed" : attention ? "Draft restored" : "Request update")}>
      {children}
    </Alert>
  );
}

/** #280: an Edit Request save the dialog runs once it has closed, so Save closes at once. `compose` says which step
 * the save was made from; `clearDraft` drops the kept draft once the save lands. */
export type BackgroundSave = { run: () => Promise<SaveResponse>; compose: boolean; clearDraft: () => void };
/** #280: why the dialog's background save was refused; the editor reopens on the step it was made from and says so. */
export type RefusedSave = { failure: IntakeFailure | null; compose: boolean };

export default function RequestEditor({
  context,
  draftOwnerId,
  active = true,
  onCreated,
  onBusyChange,
  onCancelCheckChange,
  registerCloseAttempt,
  initialProjectId = null,
  editing,
  canAddReviewers = false,
  withoutPrediction = false,
  guided = false,
  keepsBackup = false,
}: {
  /** #217: opened from the first-run guide, so each step says what it is for as the person goes. */
  guided?: boolean;
  /** #285 (spec story 29): after Discard, start empty and leave the tab's draft as the backup until something is typed. */
  keepsBackup?: boolean;
  context: { orgId: string };
  draftOwnerId: string;
  active?: boolean;
  /** The Request exists and the composer is done. `open` asks to go to it now; `created` is its list row. #286:
   * `sending` closes the composer while the save runs; the composer stays this draft's until it lands. */
  onCreated?: (requestId: string, options: { open: boolean; created?: OverviewRequest; sending?: boolean }) => void;
  onBusyChange?: (busy: boolean) => void;
  /** Decision 2026-10-21 (critique 2.3): a way to abandon the problem check while it runs, null otherwise. The composer's X and Esc use it. */
  onCancelCheckChange?: (cancel: (() => void) | null) => void;
  registerCloseAttempt?: RegisterIntakeCloseAttempt;
  initialProjectId?: string | null;
  /** `saveLabel` names the save button when the edit has one purpose ("Save goal", #261); else "Save changes".
   * `backLabel` names the review step's way back ("Back to editing", #280). With `saveInBackground` a save with no
   * files to upload is handed to the dialog, which closes at once; `refused` is that save's refusal on reopening. */
  editing?: { request: RequestDetail; onSaved: () => void; saveLabel?: string; backLabel?: string; saveInBackground?: (save: BackgroundSave) => void; refused?: RefusedSave | null };
  /** #78: non-guests can ask people to review while creating. Not offered when editing. */
  canAddReviewers?: boolean;
  /** #212: a Guest's Request has no prediction (Expected impact); the Member who takes it on writes it. */
  withoutPrediction?: boolean;
}) {
  // The closed composer stays mounted: a URL change must not re-render it (#296).
  const router = useStableRouter();
  const optimistic = useOptimisticAction();
  const refresh = useServerRefresh();
  const [original] = useState(() => editing ? requestEditValues(editing.request) : null);
  const [snapshot] = useState(() => editing ? requestEditSnapshot(editing.request) : null);
  const [initialValues] = useState<RequestInput>(() => original
    ? { ...original, expectedImpact: original.expectedImpact ?? { ...EMPTY_METRIC_IMPACT, unit: "" } }
    : emptyRequest);
  const [refusedOnOpen] = useState(() => editing?.refused ?? null);
  const [savedProblem, setSavedProblem] = useState(original?.reframedProblem ?? null);
  const [savedSolution, setSavedSolution] = useState(original?.extractedSolution ?? null);
  const [framingError, setFramingError] = useState<{ field: "reframedProblem" | "extractedSolution"; message: string } | null>(null);
  const problemFieldRef = useRef<HTMLTextAreaElement>(null);
  const solutionFieldRef = useRef<HTMLTextAreaElement>(null);
  const { toast } = useToastStack();
  const [formStage, setStage] = useState<Stage>("compose");
  const [linkOpen, setLinkOpen] = useState(false);
  const projects = useWorkspaceProjects();
  const [triage, setTriage] = useState<TriageResult | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [source, setSource] = useState<RequestInput | null>(null);
  const [editedProblem, setEditedProblem] = useState("");
  const [problemError, setProblemError] = useState<string | null>(null);
  const [failure, setFailure] = useState<GateFailure | null>(null);
  const [fileFailure, setFileFailure] = useState<string | null>(null);
  const [showSlowCue, setShowSlowCue] = useState(false);
  const [draftReady, setDraftReady] = useState(false);
  const [restoredDraft, setRestoredDraft] = useState(false);
  const [queuedAttachments, setAttachments] = useState<QueuedAttachment[]>([]);
  const [reviewers, setReviewers] = useState<ReviewerChoice[]>([]);
  const [reviewQuestion, setReviewQuestion] = useState("");
  const [reviewersError, setReviewersError] = useState<string | null>(null);
  const offerReviewers = canAddReviewers && !editing;
  // The saved row, handed to the composer so the list shows it at once.
  const createdRow = useRef<OverviewRequest | null>(null);
  const pendingWriter = usePendingMutationWriter();
  const [projectBusy, setProjectBusy] = useState(false);
  const projectInFlight = useRef(false);
  const [metricBusy, setMetricBusy] = useState(false);
  const metricInFlight = useRef(false);
  const projectDefaultApplied = useRef(false);
  const draftEdited = useRef(false);
  const validationInFlight = useRef(false);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const submitRef = useRef<HTMLButtonElement>(null);
  const failureRef = useRef<HTMLDivElement>(null);
  // #260 (C1): the review step's failure is brought into view, so a Create that didn't save never looks like nothing happened.
  const reviewFailureRef = useRef<HTMLDivElement>(null);
  // Where focus goes when the compose step shows again: the title by default,
  // the primary button after a gate failure, nowhere when a field takes it.
  const focusAfterCompose = useRef<"title" | "submit" | "none">("title");
  // #286: a save refused after Create closed the composer names a field to go to once the composer shows again.
  const focusOnShow = useRef<(() => void) | null>(null);
  const formId = useId();
  const problemRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const composeFormRef = useRef<HTMLFormElement>(null);
  const attachFilesButtonRef = useRef<HTMLButtonElement>(null);
  const [previousProblem, setPreviousProblem] = useState("");
  const [previousProblemSource, setPreviousProblemSource] = useState<Pick<RequestInput, "title" | "description"> | null>(null);
  const draftScope = intakeDraftScope(draftOwnerId, context.orgId) + (editing ? `:edit:${editing.request.id}` : "");
  // One owner for this keyed form. Hiding the retained portal does not detach it.
  const [session] = useState(() => createIntakeSession({
    scope: draftScope,
    prepare: input => callAction(() => prepareAttachmentUpload(input, context)),
    finalize: input => callAction(() => finalizeAttachmentUpload(input, context)),
    discard: input => callAction(() => discardAttachmentUpload(input, context)),
    put: uploadToSignedUrl,
    record: {
      read: () => readUnfinishedUploads(window.sessionStorage, draftScope),
      write: record => writeUnfinishedUploads(window.sessionStorage, draftScope, record),
      clear: () => clearUnfinishedUploads(window.sessionStorage, draftScope),
    },
    clearDraft: () => clearIntakeDraft(window.sessionStorage, draftScope),
  }));
  const uploadState = useSyncExternalStore(session.subscribe, session.getSnapshot, session.getSnapshot);
  const createdRequestId = uploadState.requestId;
  const attachments = createdRequestId ? uploadState.files : queuedAttachments;
  const lostUploads = uploadState.lost;
  const mutationBusy = uploadState.busy;
  const stage: Stage = uploadState.phase === "idle" ? formStage
    : uploadState.phase === "saving" ? "creating"
    : uploadState.phase === "recovery" ? "attachment_recovery"
    : uploadState.phase === "reconciling" ? "uploads_checking"
    : uploadState.phase === "lost" ? "uploads_lost" : uploadState.phase;
  function finishCreatedRequest(requestId: string, { open = false }: { open?: boolean } = {}) {
    setStage("complete");
    if (editing) {
      editing.onSaved();
      refresh();
      return;
    }
    if (onCreated) {
      onCreated(requestId, { open, created: createdRow.current?.id === requestId ? createdRow.current : undefined });
      return;
    }
    if (!open) toast(requestCreatedToast({}));
    router.push(`/requests/${requestId}`);
  }

  const presentation = useEffectEvent(() => ({
    busy: (value: boolean) => onBusyChange?.(value || projectInFlight.current || metricInFlight.current || validationInFlight.current),
    finish: (id: string, options?: { open?: boolean }) => finishCreatedRequest(id, options),
    cancelCheck: (cancel: (() => boolean) | null) => onCancelCheckChange?.(cancel ? () => {
      if (!cancel()) return;
      focusAfterCompose.current = "submit";
      setStage("compose");
    } : null),
  }));
  useLayoutEffect(() => {
    session.attach(presentation());
    return () => { void session.detach(); };
  }, [session]);
  useLayoutEffect(() => { session.bind(presentation()); session.syncBusy(); });

  const {
    control,
    register,
    handleSubmit,
    getValues,
    reset,
    setError,
    setFocus,
    setValue,
    subscribe,
    trigger,
    formState: { errors, isSubmitted },
  } = useForm<RequestInput, unknown, RequestInput>({
    // A Guest's new Request is checked without a prediction (#212).
    resolver: zodResolver((editing ? requestEditSourceSchema : newRequestSchemaFor(withoutPrediction)) as typeof requestSchema),
    defaultValues: initialValues,
  });

  // Typing in the title and description renders nothing: both fields are uncontrolled, and the
  // form watches only the values it shows (the properties row, the earlier-draft details, the
  // measurement editor's own value). A whole-form watch would hand out a fresh clone of every
  // value on each keystroke and render the entire composer with it. The draft is persisted on
  // every change through the render-free subscription below.
  const [affectedPeople, desiredChange, observedEvidence, uncertainty, projectId, requestType, priority, labelKeys] = useWatch({ control, name: shownFields });
  // #280 (B8): only a changed description is checked again; a new title keeps the saved judgement and framing.
  const descriptionUnchanged = useWatch({ control, name: "description", compute: description => Boolean(editing && original && description?.trim() === original.description) });
  const hasLink = useWatch({ control, name: "usefulLink", compute: hasText });
  // #280 (B9): an edit that changes the Request's content clears every review answer; the footer says whose.
  const valuesChangeContent = useWatch({ control, compute: values => Boolean(editing && original && editChangesContent(values, original, original)) });
  // Expected impact keeps its identity until its content changes, so the measurement editor can
  // skip every render its own value did not cause.
  const expectedImpact = useWatch({ control, name: "expectedImpact", compute: parseExpectedImpact });
  const changeExpectedImpact = useCallback((value: ExpectedImpactDraft) => {
    draftEdited.current = true;
    setValue("expectedImpact", value, { shouldDirty: true, shouldValidate: isSubmitted });
  }, [isSubmitted, setValue]);
  // Choosing "No measurable impact" keeps the measured plan typed so far; switching back restores it (#153).
  const measuredPlanBeforeChoice = useRef<ExpectedImpactDraft | null>(null);
  const chooseImpact = useCallback((choice: "measure" | "none") => {
    const current = getValues("expectedImpact");
    if (choice === "none") {
      if (current?.kind === "no_measurable_impact") return;
      if (current) measuredPlanBeforeChoice.current = parseExpectedImpact(current);
      changeExpectedImpact({ kind: "no_measurable_impact", reason: "" });
      return;
    }
    if (current?.kind !== "no_measurable_impact") return;
    changeExpectedImpact(measuredPlanBeforeChoice.current ?? createEmptyMeasurementPlan());
  }, [changeExpectedImpact, getValues]);
  const currentValues = useMemo(
    () => ({
      affectedPeople: affectedPeople ?? "",
      desiredChange: desiredChange ?? "",
      observedEvidence: observedEvidence ?? "",
      uncertainty: uncertainty ?? "",
      projectId: projectId ?? null,
      requestType: requestType ?? null,
      labelKeys,
      priority: priority ?? "none",
      expectedImpact,
    }),
    [affectedPeople, desiredChange, observedEvidence, uncertainty, projectId, requestType, priority, labelKeys, expectedImpact],
  );

  const checking = stage === "checking";
  const creating = stage === "creating";
  // The shortcut hint names the platform's key. The server knows no platform,
  // so the hint renders only on the client, to the left of a right-aligned
  // button: its arrival moves nothing.
  const shortcutHint = useSyncExternalStore(
    useCallback(() => () => {}, []),
    () => /Mac|iPhone|iPad|iPod/.test(`${navigator.platform} ${navigator.userAgent}`) ? "⌘ Enter" : "Ctrl Enter",
    () => null,
  );

  useEffect(() => {
    // A record of interrupted uploads comes before any draft: its Request
    // exists. Only a record an earlier document left means a reload.
    // An edit draft can only be restored against the exact saved version it
    // started from; never replay stale content over a newer Request.
    if (snapshot !== null) {
      const baseKey = `lane:edit-base:${draftScope}`;
      try {
        if (window.sessionStorage.getItem(baseKey) !== snapshot) clearIntakeDraft(window.sessionStorage, draftScope);
        window.sessionStorage.setItem(baseKey, snapshot);
      } catch {
        clearIntakeDraft(window.sessionStorage, draftScope);
      }
    }
    const lost = session.recoveryRecord();
    const draft = lost || keepsBackup ? null : readIntakeDraft(window.sessionStorage, draftScope);
    const restoreTimer = window.setTimeout(() => {
      if (lost) {
        void session.recover();
      } else if (draft) {
        // intake-session.ts decides what a draft restores.
        const restored = restoredComposer(draft);
        reset(restored.source);
        setSource(restored.source);
        setReviewers(restored.reviewers);
        setReviewQuestion(restored.reviewQuestion);
        setFailure(null);
        setProblemError(null);
        setRestoredDraft(true);
        setPreviousProblem(restored.previousProblem);
        setPreviousProblemSource(restored.previousProblemSource);
        if (snapshot !== null && restored.framing) {
          setSavedProblem(restored.framing.reframedProblem);
          setSavedSolution(restored.framing.extractedSolution);
        }
        if (restored.review) {
          setTriage(restored.review.triage);
          setToken(restored.review.token);
          setEditedProblem(restored.review.editedProblem);
          setStage("framing");
        } else {
          setStage("compose");
        }
      }

      // #280: the dialog reopened after its save was refused: say why, on the step the save was made from.
      if (refusedOnOpen) {
        const failure = refusedOnOpen.failure ?? { code: "save_failed" as const, message: `Your changes couldn’t be saved. ${TEXT_KEPT} Try again.` };
        setRestoredDraft(false);
        const field = failure.code === "validation" ? failure.field : undefined;
        if (field === "editedProblemText") setProblemError(failure.message);
        else if (field && field !== "reviewers") setError(field, { type: "server", message: failure.message });
        else setFailure(failure);
        if (refusedOnOpen.compose) focusAfterCompose.current = "submit";
      }
      setDraftReady(true);
    }, 0);

    return () => {
      window.clearTimeout(restoreTimer);
    };
  }, [draftScope, keepsBackup, refusedOnOpen, reset, session, setError, snapshot]);

  useEffect(() => {
    if (!draftReady || !active || !initialProjectId || projectDefaultApplied.current) return;
    if (restoredDraft || draftEdited.current || stage !== "compose" || attachments.length > 0 || currentValues.projectId) {
      projectDefaultApplied.current = true;
      return;
    }
    // This list came through the workspace/guest guard. Never trust a Project
    // from the URL or overwrite a draft while its options are still loading.
    if (!projects.projects.some((project) => project.id === initialProjectId)) return;
    projectDefaultApplied.current = true;
    setValue("projectId", initialProjectId);
  }, [active, attachments.length, currentValues.projectId, draftReady, initialProjectId, projects.projects, restoredDraft, setValue, stage]);

  // #78: reviewer picks and their question are restored with the draft, like Project, Labels and Priority.
  const reviewersDraft = offerReviewers ? { people: reviewers, question: reviewQuestion } : undefined;
  /** The draft for the composer as it stands (intake-session.ts). */
  const currentDraft = () => composerDraft({ stage, triage, token, editedProblem, source, values: getValues(), previousProblem, previousProblemSource, reviewers: reviewersDraft,
    framing: editing ? { reframedProblem: savedProblem, extractedSolution: savedSolution } : undefined });
  const persistDraft = useEffectEvent(() => {
    if (!draftReady || (keepsBackup && !draftEdited.current) || session.getSnapshot().requestId || stage === "uploads_checking" || stage === "uploads_lost") return true;
    try {
      return session.persistDraft(() => writeIntakeDraft(window.sessionStorage, draftScope, currentDraft()));
    } catch { return false; }
  });

  useEffect(() => {
    persistDraft();
  }, [
    draftReady,
    draftScope,
    editedProblem,
    source,
    stage,
    token,
    triage,
    previousProblem,
    previousProblemSource,
    reviewers,
    reviewQuestion,
    savedProblem,
    savedSolution,
  ]);
  // Every value change, keystrokes included, without a render of the form.
  useEffect(() => subscribe({ formState: { values: true }, callback: () => { persistDraft(); } }), [subscribe]);

  useEffect(() => {
    if (!active || !draftReady) return;
    const focusField = focusOnShow.current;
    focusOnShow.current = null;
    if (focusField) {
      focusField();
      return;
    }
    if (stage !== "compose") {
      headingRef.current?.focus();
      return;
    }
    const target = focusAfterCompose.current;
    focusAfterCompose.current = "title";
    if (target === "title") {
      if (window.matchMedia("(pointer: coarse)").matches) composeFormRef.current?.focus({ preventScroll: true });
      else setFocus("title");
    }
    else if (target === "submit") {
      submitRef.current?.focus();
      failureRef.current?.scrollIntoView({ block: "nearest" });
    }
  }, [active, draftReady, setFocus, stage]);

  useEffect(() => {
    if (active && failure && stage === "framing") reviewFailureRef.current?.scrollIntoView({ block: "nearest" });
  }, [active, failure, stage]);

  useEffect(() => {
    if (!checking) return;
    const timer = window.setTimeout(() => setShowSlowCue(true), 5_000);
    return () => window.clearTimeout(timer);
  }, [checking]);

  const hasPendingUploads =
    Boolean(createdRequestId) &&
    attachments.some((attachment) => attachment.status !== "uploaded");

  const busy =
    stage !== "complete" &&
    (checking || creating || stage === "uploading" || mutationBusy || projectBusy || metricBusy);

  const blocksWorkspaceSwitch = stage !== "complete" &&
    (busy || attachments.some((attachment) => attachment.status !== "uploaded"));
  useEffect(() => {
    if (stage === "complete") return;
    // A workspace switch reloads the document, including a closed composer's
    // in-memory File objects. Text drafts already have workspace-scoped storage.
    const blockSwitch = (event: Event) => {
      if (blocksWorkspaceSwitch || !persistDraft()) event.preventDefault();
    };
    window.addEventListener(WORKSPACE_SWITCH_EVENT, blockSwitch);
    return () => window.removeEventListener(WORKSPACE_SWITCH_EVENT, blockSwitch);
  }, [blocksWorkspaceSwitch, stage]);

  useEffect(() => {
    if (active || stage === "complete" || !hasPendingUploads) return;
    // The hidden composer retains File objects across in-app navigation, but a
    // full reload would still discard unfinished uploads and their retry state.
    const beforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", beforeUnload);
    return () => window.removeEventListener("beforeunload", beforeUnload);
  }, [active, hasPendingUploads, stage]);

  // A restored draft is announced here, once: this region is always mounted,
  // so its new text is read, and the visible notice is not a live region.
  const liveStatus =
    restoredDraft && !checking && !creating
      ? "Your unsaved Request was restored."
      : stage === "framing" && triage
        ? "Your Request is ready to review."
        : creating
          ? editing ? "Saving changes." : "Creating the Request."
          : stage === "uploading"
            ? "Uploading Request files."
            : "";



  function addFiles(files: File[]) {
    setFileFailure(null);
    const next = files.map((file) => ({
      fileName: file.name,
      mimeType: file.type,
      sizeBytes: file.size,
    }));

    for (const metadata of next) {
      const validation = validateAttachmentMetadata(metadata);
      if (!validation.valid) {
        setFileFailure(validation.message);
        return;
      }
    }

    const selection = validateAttachmentSelection([
      ...attachments.map((attachment) => ({
        fileName: attachment.file.name,
        mimeType: attachment.file.type,
        sizeBytes: attachment.file.size,
      })),
      ...next,
    ]);
    if (!selection.valid) {
      setFileFailure(selection.message);
      return;
    }

    setAttachments((current) => [
      ...current,
      ...files.map((file) => ({
        key: crypto.randomUUID(),
        file,
        status: "queued" as const,
        progress: 0,
        attachmentId: null,
        error: null,
      })),
    ]);
  }

  function removeQueuedFile(key: string) {
    setAttachments((current) =>
      current.filter((attachment) => attachment.key !== key),
    );
    setFileFailure(null);
  }

  async function checkFraming(data: RequestInput) {
    if (session.getSnapshot().busy) return;
    setLinkOpen(false);
    setRestoredDraft(false);
    setFailure(null);
    setProblemError(null);
    const keepEarlierProblem = previousProblemSource?.title === data.title && previousProblemSource?.description === data.description;
    setSource(data);
    setShowSlowCue(false);
    await session.check({
      run: () => callAction(() => editing ? runTriage(data, context, editing.request.id) : runTriage(data, context)),
      receive: (result: TriageResponse) => {
        if (!result.success) {
          if (result.error.code === "validation" && result.error.field) {
            if (result.error.field === "editedProblemText" || result.error.field === "reviewers") {
              setFailure(result.error);
            } else {
              setError(result.error.field, {
                type: "server",
                message: result.error.message,
              });
              if (result.error.field === "usefulLink") setLinkOpen(true);
              focusAfterCompose.current = "none";
              setStage("compose");
              const field = result.error.field;
              // Optional controls may have just expanded. Wait for their render
              // before moving focus to the rejected field.
              const focusTimeout = window.setTimeout(session.guard(() => focusRequestField(field)), 0);
              return () => window.clearTimeout(focusTimeout);
            }
          } else {
            setFailure(result.error);
          }
          focusAfterCompose.current = "submit";
          setStage("compose");
          return;
        }

        setTriage(result.triage);
        setToken(result.token);
        if (result.triage.classification === "problem") {
          // A fresh classification can change. Keep earlier user wording
          // recoverable, without submitting it as the new Request's framing.
          if (editedProblem) setPreviousProblem(editedProblem);
          setEditedProblem("");
        } else {
          const nextProblem = keepEarlierProblem && (editedProblem || previousProblem)
            ? editedProblem || previousProblem
            : result.triage.reframedProblem ?? "";
          setEditedProblem(nextProblem);
          setPreviousProblem(nextProblem);
          setPreviousProblemSource({ title: data.title, description: data.description });
        }
        setStage("framing");
      },
      failed: thrown => {
        setFailure(thrownGateFailure(!isOfflineError(thrown) && !isOffline()));
        focusAfterCompose.current = "submit";
        setStage("compose");
      },
    });
  }


  /** The saved row joins the list's Open group through the overlay at once,
   * before any upload (plan item 2.3). No router refresh: the
   * save already revalidated the list. */
  function showCreatedInList(created: OverviewRequest | undefined) {
    if (!created) return;
    const row = { ...created, canEdit: true, projectName: projects.projects.find((project) => project.id === created.projectId)?.name ?? created.projectName };
    createdRow.current = row;
    pendingWriter?.insert(row);
  }

  function openLostRequest() { session.openLost(); }
  function dismissLostUploads() { session.dismissLost(); }

  async function onConfirm(unchangedSource?: RequestInput) {
    const savingSource = unchangedSource ?? source;
    if (session.getSnapshot().busy || !savingSource || (!unchangedSource && (!triage || !token))) return;
    if (unchangedSource) setSource(unchangedSource);

    if (!unchangedSource && triage?.classification !== "problem") {
      const parsed = problemFramingSchema.safeParse(editedProblem);
      if (!parsed.success) {
        setProblemError(parsed.error.issues[0].message);
        problemRef.current?.focus();
        return;
      }
      setEditedProblem(parsed.data);
    }

    setRestoredDraft(false);
    setFailure(null);
    setProblemError(null);

    // #280: with no files to upload, the dialog closes at once and runs the save; the draft kept here reopens it,
    // everything typed included, if the server refuses.
    if (editing?.saveInBackground && original && snapshot && !attachments.length) {
      const compose = Boolean(unchangedSource);
      const input = { requestId: editing.request.id, source: savingSource, original,
        initialImpact: initialValues.expectedImpact, noMeasurableImpactReason: editing.request.noMeasurableImpactReason ?? null,
        unchanged: compose, savedProblem, savedSolution, snapshot, token, triage, editedProblem };
      const patch = { kind: "edit" as const, title: savingSource.title,
        projectId: savingSource.projectId ?? null, projectName: projects.projects.find(project => project.id === savingSource.projectId)?.name ?? null,
        labelKeys: requestLabelKeys(savingSource) };
      session.persistDraft(() => writeIntakeDraft(window.sessionStorage, draftScope, currentDraft()));
      editing.saveInBackground({ compose, run: () => saveEditedIntake(input, context, optimistic, patch), clearDraft: () => clearIntakeDraft(window.sessionStorage, draftScope) });
      return;
    }

    // #286: with no files to upload, Create closes the composer at once. The list shows the Request, sending, under
    // the id its signed review gave it, so the row keeps its place when the saved one, with its number, replaces it.
    // A save that doesn't land reopens the composer with everything typed and says why. Offline, Create answers in
    // place (#285, C1); with files, the visible upload step stays.
    const sendingId = !editing && !attachments.length && onCreated && !isOffline() ? reviewedRequestId(token) : null;
    let answered = false;
    if (sendingId) {
      pendingWriter?.insert(sendingRow(sendingId, savingSource));
      onCreated?.(sendingId, { open: false, sending: true });
    }
    const reopen = () => {
      if (!sendingId) return;
      pendingWriter?.withdraw(sendingId);
      openShellSurface("composer");
    };
    await session.save({
      title: savingSource.title, attachments,
      run: () => editing && original && snapshot
        ? saveEditedIntake({ requestId: editing.request.id, source: savingSource, original,
          initialImpact: initialValues.expectedImpact, noMeasurableImpactReason: editing.request.noMeasurableImpactReason ?? null,
          unchanged: Boolean(unchangedSource), savedProblem, savedSolution, snapshot,
          token, triage, editedProblem }, context, optimistic)
        : saveNewIntake({ token, triage, editedProblem, offerReviewers, reviewers, reviewQuestion }, context),
      saved: result => { answered = true; showCreatedInList(result.created); },
      failed: (failure, thrown) => {
        answered = true;
        showSaveFailure(failure, thrown, Boolean(unchangedSource), Boolean(sendingId));
        reopen();
      },
    });
    // The save stopped before it was sent (another form's unfinished files): the composer says so.
    if (!answered) reopen();
  }

  /** #286: the Request as the list shows it while it sends: its typed title, Open, with no number yet. */
  function sendingRow(id: string, data: RequestInput): OverviewRequest {
    return { id, sending: true, title: data.title, reframedProblem: triage?.classification === "problem" ? null : editedProblem.trim(),
      status: "open", createdAt: new Date().toISOString(), creatorName: null, assigneeName: null, assignedTo: null,
      projectId: data.projectId ?? null, projectName: projects.projects.find(project => project.id === data.projectId)?.name ?? null,
      requestType: data.requestType ?? null, labelKeys: requestLabelKeys(data), priority: data.priority ?? "none" };
  }

  /** A save that didn't land: the field it names, or the message on the step it was made from (`compose`). `closed`:
   * the composer closed at Create (#286), so the field takes focus once it shows again. */
  function showSaveFailure(failure: IntakeFailure | null, thrown: unknown, compose: boolean, closed = false) {
    const focusSoon = (focus: () => void) => {
      if (closed) focusOnShow.current = focus;
      else window.setTimeout(session.guard(focus), 0);
    };
    // #286: a connection lost while the save was on its way reads as offline too.
    if (!failure && (isOfflineError(thrown) || isOffline())) {
      // #260 (C1): offline says so; nothing was sent and the text stays.
      setFailure(thrownGateFailure(false));
      setStage(compose ? "compose" : "framing");
      return;
    }
    const message = editing ? `Your changes couldn’t be saved. ${TEXT_KEPT} Try again.` : `Your Request couldn’t be created. ${TEXT_KEPT} Try again.`;
    const result = { error: failure ?? { code: "save_failed" as const, message, field: undefined } };
    if (result.error.code === "validation" && (result.error.field === "projectId" || result.error.field === "requestType" || result.error.field === "expectedImpact")) {
      const field = result.error.field;
      setError(field, { type: "server", message: result.error.message });
      focusAfterCompose.current = "none";
      setStage("compose");
      focusSoon(() => focusRequestField(field));
      return;
    }
    if (result.error.field === "reviewers") {
      // Nothing was created: back to the compose step, where the picker shows why.
      setReviewersError(result.error.message);
      focusAfterCompose.current = "none";
      setStage("compose");
      focusSoon(() => document.getElementById("intake-reviewers")?.focus());
      return;
    }
    if (
      result.error.code === "validation" &&
      result.error.field === "editedProblemText"
    ) {
      setProblemError(result.error.message);
      focusSoon(() => problemRef.current?.focus());
      return;
    } else {
      setFailure(result.error);
    }
    setStage(compose ? "compose" : "framing");
  }

  async function retryAttachments(failed: QueuedAttachment[]) { await session.retry(failed.map(file => file.key)); }
  async function retryFailedFiles() { await session.retry(); }
  async function removeFailedFile(attachment: QueuedAttachment) { await session.remove(attachment.key); }
  async function continueWithoutFailedFiles() { await session.continueWithout(); }


  function preserveDraftForSignIn() {
    session.persistDraft(() => writeIntakeDraft(window.sessionStorage, draftScope, currentDraft()));
  }

  // One handler for both steps: Cmd/Ctrl+Enter is the primary action wherever
  // focus is in the composer, including its portalled property menus.
  function onComposerKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (!active || event.key !== "Enter" || !(event.metaKey || event.ctrlKey) || event.defaultPrevented) return;
    if (stage === "compose") {
      event.preventDefault();
      submitForReview();
    } else if (stage === "framing") {
      event.preventDefault();
      if (failure?.code === "review_expired" && source) void checkFraming(source);
      else void onConfirm();
    }
  }

  const composing = stage === "compose" || checking;
  const framingReworded = Boolean(original) && ((savedProblem ?? "").trim() !== (original?.reframedProblem ?? "").trim() || (savedSolution ?? "").trim() !== (original?.extractedSolution ?? "").trim());
  // Incomplete guardrails and recovered pending changes must be resolved first.
  const guardrailEditing = hasGuardrailEdits(currentValues.expectedImpact);
  const reviewing = stage === "framing" || creating;
  // A review step follows a changed description, which is always a change of content.
  const resetNote = editing && (reviewing || valuesChangeContent || framingReworded) ? reviewResetWarning(editing.request.answeredReviews) : null;
  // #280: what the re-check does to the framing saved before it.
  const savedFramingChanges = editing && original && triage ? framingChanges(original, { classification: triage.classification, reframedProblem: editedProblem, extractedSolution: triage.extractedSolution }) : [];
  // Compose shows gate failures; review-step failures keep their own alert.
  const gateNotice = composing && failure ? gateFailureNotice(failure) : null;
  const shortcut = shortcutHint && <KeyCap className={styles.shortcut}>{shortcutHint}</KeyCap>;

  function onProjectBusyChange(value: boolean) {
    projectInFlight.current = value;
    setProjectBusy(value);
    session.syncBusy();
  }

  function onMetricBusyChange(value: boolean) {
    metricInFlight.current = value;
    setMetricBusy(value);
    session.syncBusy();
  }

  async function finishLink() {
    if (await trigger("usefulLink")) setLinkOpen(false);
    else setFocus("usefulLink");
  }

  /** A failed submit focuses the shared measurement controls. */
  function revealImpact() {
    const section = document.getElementById("intake-expected-impact");
    (section?.querySelector<HTMLElement>('[aria-invalid="true"]') ?? section?.querySelector<HTMLElement>('[role="combobox"]') ?? section)?.focus();
  }

  function focusRequestField(field: keyof RequestInput) {
    if (field === "projectId") document.getElementById("intake-project")?.focus();
    else if (field === "requestType") document.getElementById("intake-request-labels")?.focus();
    else if (field === "priority") document.getElementById("intake-priority")?.focus();
    else if (field === "expectedImpact") revealImpact();
    else if (earlierDraftFields.some(({ name }) => name === field)) document.getElementById("intake-earlier-details")?.focus();
    else setFocus(field);
  }

  function submitForReview() {
    if (!active || checking || projectInFlight.current || metricInFlight.current || hasGuardrailEdits(getValues("expectedImpact"))) return;
    const invalidNumber = [...(composeFormRef.current?.querySelectorAll<HTMLInputElement>('input[type="number"]') ?? [])]
      .find(input => !input.disabled && (input.validity.badInput || input.validity.customError));
    if (invalidNumber) {
      invalidNumber.focus();
      invalidNumber.reportValidity();
      return;
    }
    if (validationInFlight.current || session.getSnapshot().busy) return;
    validationInFlight.current = true;
    session.syncBusy();
    void handleSubmit(session.guard(data => {
      if (original && editing && data.description.trim() === original.description) {
        // An unchanged description keeps its judgement, so its framing can be reworded but not emptied.
        const framing = savedFraming(storedShape({ classification: editing.request.classification, reframedProblem: original.reframedProblem, extractedSolution: original.extractedSolution }), { reframedProblem: savedProblem, extractedSolution: savedSolution });
        if (!framing.ok) {
          setFramingError(framing);
          (framing.field === "reframedProblem" ? problemFieldRef : solutionFieldRef).current?.focus();
          return;
        }
        void onConfirm(data);
      } else void checkFraming(data);
    }), session.guard((fieldErrors) => {
      const firstField = Object.keys(fieldErrors)[0] as keyof RequestInput | undefined;
      if (!firstField) return;
      if (firstField !== "title" && firstField !== "description") {
        if (firstField === "usefulLink") setLinkOpen(true);
        focusRequestField(firstField);
      }
    }))().finally(() => { validationInFlight.current = false; session.syncBusy(); });
  }

  return (
    <div
      className={cn(styles.composer, styles.dialog)}
      onKeyDown={onComposerKeyDown}
    >
      {active && stage !== "complete" && (creating || hasPendingUploads) && (
        <IntakeNavigationGuard creating={creating} onLeave={() => { void session.leave(); }}
          registerCloseAttempt={stage === "uploading" ? registerCloseAttempt : undefined} />
      )}
      <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {active ? liveStatus : ""}
      </p>
      <div className={styles.scroll}>
        {active && <ComposerOfflineLine />}
        {uploadState.error && <Alert tone="danger" title={uploadState.error} />}
        {composing && (
          <form
            id={formId}
            ref={composeFormRef}
            tabIndex={-1}
            aria-label="Request details"
            hidden={checking}
            noValidate
            onChangeCapture={() => { draftEdited.current = true; }}
            aria-busy={checking || projectBusy || metricBusy || undefined}
            onSubmit={(event) => {
              event.preventDefault();
              submitForReview();
            }}
            onDragOver={(event) => {
              if (checking || !event.dataTransfer.types.includes("Files")) return;
              event.preventDefault();
              event.dataTransfer.dropEffect = "copy";
            }}
            onDrop={(event) => {
              if (checking || !event.dataTransfer.files.length) return;
              event.preventDefault();
              addFiles(Array.from(event.dataTransfer.files));
            }}
            className={styles.form}
          >
            {restoredDraft && (
              <IntakeNotice attention>
                Your text and links were restored. Choose any files again before creating the Request.
              </IntakeNotice>
            )}
            <div className={styles.context}>
            <div className="space-y-2">
              <LimitedTextarea
                control={control}
                limit={TITLE_MAX}
                rows={1}
                label="Request title"
                hideLabel
                appearance="plain"
                id="intake-title"
                placeholder="Request title"
                readOnly={checking}
                className={styles.title}
                error={errors.title?.message}
                data-composer-autofocus={stage === "compose" ? "" : undefined}
                onKeyDown={(event) => {
                  // Enter moves to the description; only Cmd/Ctrl+Enter submits.
                  if (event.key !== "Enter" || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey || event.nativeEvent.isComposing) return;
                  event.preventDefault();
                  setFocus("description");
                }}
                {...register("title")}
              />
              <LimitedTextarea
                control={control}
                limit={DESCRIPTION_MAX}
                label="Description"
                hideLabel
                appearance="plain"
                id="intake-description"
                placeholder="Add a description…"
                rows={3}
                readOnly={checking}
                className={styles.description}
                error={errors.description?.message}
                {...register("description")}
              />
              {guided && <FirstRunHint>Describe the problem people have, not the fix. Lane checks the framing when you review.</FirstRunHint>}
            </div>

            <div className={styles.properties} aria-label="Request properties and supporting details">
              <ProjectPicker orgId={context.orgId} value={currentValues.projectId ?? null} onChange={(value) => { draftEdited.current = true; setValue("projectId", value, { shouldDirty: true, shouldValidate: true }); }} disabled={checking} state={projects} onBusyChange={onProjectBusyChange} error={errors.projectId?.message} />
              <RequestLabelsPicker orgId={context.orgId} project={projects.projects.find(project => project.id === currentValues.projectId)} value={requestLabelKeys(currentValues)} onChange={(keys) => {
                const value = labelRequestType(keys);
                setValue("labelKeys", keys, { shouldDirty: true, shouldValidate: true });
                draftEdited.current = true;
                const impact = getValues("expectedImpact");
                if (value !== "new_feature" && impact?.kind === "measurement" && impact.primary.noBaseline) {
                  setValue("expectedImpact", { ...impact, primary: { ...impact.primary, noBaseline: false } }, { shouldDirty: true });
                }
                setValue("requestType", value, { shouldDirty: true, shouldValidate: true });
              }} disabled={checking || projectBusy} />
              <RequestPriorityPicker value={currentValues.priority ?? "none"} onChange={value => { draftEdited.current = true; setValue("priority", value, { shouldDirty: true, shouldValidate: true }); }} disabled={checking || projectBusy} />
              {offerReviewers && <RequestReviewersPicker orgId={context.orgId} value={reviewers} excludeUserId={draftOwnerId} disabled={checking}
                error={reviewersError ?? undefined} onChange={(next) => { draftEdited.current = true; setReviewers(next); setReviewersError(null); }}
                question={reviewQuestion} onQuestionChange={(next) => { draftEdited.current = true; setReviewQuestion(next); setReviewersError(null); }} />}
              <Popover open={linkOpen && !checking} onOpenChange={setLinkOpen}>
                <PopoverTrigger asChild>
                  <Button type="button" variant="secondary" size="sm" disabled={checking} aria-invalid={Boolean(errors.usefulLink) || undefined}>
                    <span className={styles.propertyContent}>{hasLink ? <CheckIcon aria-hidden="true" /> : <PlusIcon aria-hidden="true" />}<span>Add link</span></span>
                  </Button>
                </PopoverTrigger>
                <PopoverContent {...pickerPopoverProps} inert={linkOpen ? undefined : true} aria-label="Related link" className={pickerLayout.formPanel}
                  onOpenAutoFocus={(event) => { event.preventDefault(); setFocus("usefulLink"); }}>
                  <Input label="Related link" id="intake-useful-link" type="url" inputMode="url" placeholder="https://…" maxLength={USEFUL_LINK_MAX} readOnly={checking}
                    error={errors.usefulLink?.message} {...register("usefulLink")}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" && !event.nativeEvent.isComposing) {
                        event.preventDefault();
                        void finishLink();
                      }
                    }} />
                  <div className={pickerLayout.formActions}>
                    {hasLink && <Button type="button" variant="ghost" size="sm" onClick={() => {
                      draftEdited.current = true;
                      setValue("usefulLink", "", { shouldDirty: true, shouldValidate: true });
                      setLinkOpen(false);
                    }}>Remove link</Button>}
                    <Button type="button" variant="secondary" size="sm" onClick={() => void finishLink()}>Save link</Button>
                  </div>
                </PopoverContent>
              </Popover>
              <Button ref={attachFilesButtonRef} type="button" variant="ghost" size="sm" onClick={() => fileInputRef.current?.click()} disabled={checking}>
                <span className={styles.propertyContent}><PaperclipIcon aria-hidden="true" /><span>Attach files</span></span>
              </Button>
              <input ref={fileInputRef} type="file" aria-label="Choose Request files" tabIndex={-1} multiple accept={ATTACHMENT_ACCEPT} className="sr-only" disabled={checking}
                onChange={(event) => { addFiles(Array.from(event.target.files ?? [])); event.target.value = ""; }} />
            </div>
            <FieldError id="intake-project-error">{errors.projectId?.message}</FieldError>
            <FieldError id="intake-request-type-error">{errors.requestType?.message}</FieldError>
            <FieldError id="intake-reviewers-error">{offerReviewers && reviewersError}</FieldError>
            {guided && offerReviewers && <FirstRunHint>Reviewers are optional: the teammates you add answer Looks good or Raise a concern before work starts.</FirstRunHint>}
            {withoutPrediction && <p className="text-sm text-muted-foreground" data-guest-prediction-note>{editing ? "The Member who takes this on sets its goal." : "A Member takes this on and sets its goal. You’ll get an email when they do."}</p>}
            </div>
            {!withoutPrediction && currentValues.expectedImpact && <div className={styles.impact}>
              {guided && <FirstRunHint>Set the goal: pick the metric from the Metrics library, where it is now and where you want it to go.</FirstRunHint>}
              <h2 id="intake-goal-heading" className={styles.impactHeading}>Goal</h2>
              {/* #285 (C20): Arc radio cards, so the card that isn't chosen still reads as a choice. */}
              <RadioCards aria-labelledby="intake-goal-heading" name="expected-impact-choice" disabled={checking || metricBusy}
                value={currentValues.expectedImpact.kind === "no_measurable_impact" ? "none" : "measure"}
                onValueChange={next => { if (next === "none" || next === "measure") chooseImpact(next); }}
                options={GOAL_CHOICES} />
              {currentValues.expectedImpact.kind === "no_measurable_impact" ? (
                <Textarea
                  label="Why there is no measurable impact"
                  value={currentValues.expectedImpact.reason}
                  maxLength={NO_MEASURABLE_IMPACT_REASON_MAX}
                  disabled={checking}
                  error={isSubmitted && !currentValues.expectedImpact.reason.trim() ? "Say why this Request has no measurable impact" : undefined}
                  onChange={(event) => changeExpectedImpact({ kind: "no_measurable_impact", reason: event.target.value })}
                />
              ) : <>
                {errors.expectedImpact?.type === "server" && errors.expectedImpact.message && (
                  <Alert tone="danger" title="Check measurement">{errors.expectedImpact.message}</Alert>
                )}
                {!editing && currentValues.expectedImpact.kind !== "measurement" && errors.expectedImpact && errors.expectedImpact.type !== "server" && (
                  <Alert tone="danger" title="Check measurement">Complete the metric or verified result and measurement window before reviewing.</Alert>
                )}
                <PlanFields
                  layout="plain"
                  // The library is read on the first open, not while the closed composer renders ahead of it (#296).
                  orgId={active ? context.orgId : undefined}
                  value={currentValues.expectedImpact}
                  onChange={changeExpectedImpact}
                  requestType={currentValues.requestType ?? null}
                  disabled={checking || metricBusy}
                  onBusyChange={onMetricBusyChange}
                  submitted={isSubmitted}
                />
              </>}
            </div>}
            {editing && savedProblem !== null && <Textarea ref={problemFieldRef} label="Problem to solve" value={savedProblem} maxLength={DESCRIPTION_MAX} readOnly={checking} error={framingError?.field === "reframedProblem" ? framingError.message : undefined} onChange={event => { setSavedProblem(event.target.value); setFramingError(null); }} />}
            {editing && savedSolution !== null && <Textarea ref={solutionFieldRef} label="Suggested change" value={savedSolution} maxLength={DESCRIPTION_MAX} readOnly={checking} error={framingError?.field === "extractedSolution" ? framingError.message : undefined} onChange={event => { setSavedSolution(event.target.value); setFramingError(null); }} />}
            <EarlierDraftDetails values={currentValues} error={earlierDraftFields.map(({ name }) => errors[name]?.message).find(Boolean)} />
            {previousProblem && <section aria-label="Problem from your earlier review" className="space-y-2 border-t pt-4">
              <h2 className="text-sm font-medium">Problem from your earlier review</h2>
              <p className="whitespace-pre-wrap break-words text-sm text-muted-foreground">{previousProblem}</p>
            </section>}

            {fileFailure && <IntakeNotice error>{fileFailure}</IntakeNotice>}
            <IntakeAttachmentList items={attachments} mode="queued" disabled={checking}
              onRemove={(item) => removeQueuedFile(item.key)} emptyFocusRef={attachFilesButtonRef} />
            {attachments.length > 0 && (
              <p className="text-xs text-muted-foreground">
                Up to {MAX_ATTACHMENT_FILES} files, 10 MB each and 25 MB together. Files upload after saving. Choose them again if you reload.
              </p>
            )}
            {gateNotice && (
              <div ref={failureRef}>
                <Alert tone={gateNotice.tone} title={gateNotice.title}>
                  <span>{gateNotice.body}</span>
                  {gateNotice.signIn && (
                    <> <Link href="/login#/?redirect_url=%2Fintake" onClick={preserveDraftForSignIn} className="font-medium text-foreground underline underline-offset-4">Sign in again</Link></>
                  )}
                </Alert>
              </div>
            )}
          </form>
        )}
        {(checking || (creating && !triage)) && (
          // Plan item 2.3: the gate acknowledges within a frame with the review
          // step's shape. The compose form above stays mounted but hidden, so
          // its values, number text, disclosure state and files survive a failure.
          <div className="space-y-6">
            <div className="space-y-2">
              {/* Focus reads the status with the heading: a live region inserted
                  with its text is often not announced, and focus would win. */}
              <h2 ref={headingRef} tabIndex={-1} className="text-lg font-medium" data-composer-autofocus="" aria-describedby="intake-checking-status">Review Request</h2>
              <p id="intake-checking-status" role="status" className="text-sm text-muted-foreground">
                {creating ? "Saving changes…" : showSlowCue ? `Still checking. ${TEXT_KEPT}` : "Checking whether this describes a problem…"}
              </p>
            </div>
            <Placeholder><div aria-hidden="true" className="space-y-6">
              <Skeleton lines={2} />
              <Skeleton lines={4} />
              <div className="border-t pt-5"><Skeleton lines={3} /></div>
            </div></Placeholder>
          </div>
        )}
      {reviewing && triage && source && (
        // Plan item 2.3: one ordered list of blocks, then the
        // footer. The alignment increment's block will slot in before the footer.
        <div
          className={cn(reveal, "space-y-6")}
          aria-busy={creating || undefined}
        >
          <header className="space-y-2">
            <h2 ref={headingRef} tabIndex={-1} className="text-lg font-medium" data-composer-autofocus="">Review Request</h2>
            {triage.classification !== "problem" && (
              <p className={styles.intro}>
                {aiAttribution[triage.classification]}
              </p>
            )}
            {guided && <FirstRunHint>{triage.classification === "problem"
              ? "Lane’s framing check read this as a problem, so it keeps your wording."
              : "This is Lane’s framing check: confirm the problem, or change it, before you create the Request."}</FirstRunHint>}
            {restoredDraft && (
              <IntakeNotice attention>
                Your review was restored. Text and links are still here.
                Choose any files again before creating the Request.
              </IntakeNotice>
            )}
          </header>

          <div className="space-y-1">
            <h3 className="break-words text-lg font-medium">{source.title}</h3>
            {requestLabelKeys(source).length > 0 && <RequestLabels request={source} />}
            {/* #285 (C21): each value on the line under the title says what it is. */}
            {(source.projectId || (source.priority && source.priority !== "none")) && (
              <p className="text-sm text-muted-foreground" data-review-properties="">
                {[
                  source.priority && source.priority !== "none" ? `Priority: ${REQUEST_PRIORITY_LABELS[source.priority]}` : null,
                  source.projectId ? `Project: ${projects.projects.find((project) => project.id === source.projectId)?.name ?? "Selected Project"}` : null,
                ].filter((part): part is string => part !== null).map((part, index) => <Fragment key={part}>{index > 0 && " · "}<span>{part}</span></Fragment>)}
              </p>
            )}
            {offerReviewers && reviewers.length > 0 && (
              <p className="text-sm text-muted-foreground" aria-label={`Reviewers: ${reviewers.map((person) => person.name).join(", ")}`}>
                Reviewers: <span title={reviewers.map((person) => person.name).join(", ")}>{reviewers.length > 3 ? reviewerSummary(reviewers) : reviewers.map((person) => person.name).join(", ")}</span>
              </p>
            )}
          </div>

          {savedFramingChanges.length > 0 && (
            <section aria-labelledby="framing-changes-heading" className={styles.framingChanges} data-framing-changes="">
              <h3 id="framing-changes-heading" className="text-sm font-medium">What saving changes</h3>
              <p className="text-sm text-muted-foreground">The new description was checked again. Saving replaces what this Request says now.</p>
              <dl className={styles.framingChangeList}>
                {savedFramingChanges.map(change => (
                  <div key={change.label} className={styles.framingChange}>
                    <dt className="text-sm font-medium">{change.label}</dt>
                    <dd><span className={styles.framingChangeWhen}>Before</span><span className="whitespace-pre-wrap break-words">{change.before}</span></dd>
                    <dd><span className={styles.framingChangeWhen}>After</span>{change.after === null
                      ? <span className="text-muted-foreground">Removed</span>
                      : <span className="whitespace-pre-wrap break-words">{change.after}</span>}</dd>
                  </div>
                ))}
              </dl>
            </section>
          )}

          {triage.classification === "problem" ? (
            // #285 (C7): the typed title heads the review, and the problem it keeps is labelled as the Request's page labels it.
            <section aria-labelledby="review-problem-heading" className="space-y-2">
              <h3 id="review-problem-heading" className="text-sm font-medium">Problem to solve</h3>
              <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">{source.description}</p>
            </section>
          ) : (
            <div className="space-y-5">
              <section
                aria-label="Problem to solve"
                className="min-w-0"
              >
                <Textarea
                  label="Problem to solve"
                  id="problem-framing"
                  ref={problemRef}
                  value={editedProblem}
                  onChange={(event) => {
                    setEditedProblem(event.target.value);
                    if (problemError) setProblemError(null);
                  }}
                  rows={3}
                  maxLength={DESCRIPTION_MAX}
                  readOnly={creating}
                  error={problemError ?? undefined}
                  className="min-h-24 resize-y text-sm leading-relaxed"
                />
                {/* #285 (C21): a note about saving, set apart from the field so it doesn't read as part of it. */}
                <p className={styles.note}><InfoIcon data-icon-size="sm" aria-hidden="true" /><span>Your original description will also be saved.</span></p>
              </section>

              <aside
                aria-labelledby="source-request-heading"
                className="min-w-0 space-y-2"
              >
                <h2
                  id="source-request-heading"
                  className={cn("text-sm font-medium", "text-muted-foreground")}
                >
                  Your original Request
                </h2>
                <p
                  className={cn(
                    "text-sm leading-relaxed",
                    "mt-2 whitespace-pre-wrap break-words text-muted-foreground",
                  )}
                >
                  {source.description}
                </p>

                {triage.classification === "hybrid" &&
                  triage.extractedSolution && (
                    <div className="mt-5 border-t pt-5">
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <LightbulbIcon
                          aria-hidden="true"
                        />
                        <h3 className={cn("text-sm font-medium")}>
                          Suggested change
                        </h3>
                      </div>
                      <p
                        className={cn(
                          "text-sm leading-relaxed",
                          "mt-2 break-words text-muted-foreground",
                        )}
                      >
                        {triage.extractedSolution}
                      </p>
                    </div>
                  )}
              </aside>
            </div>
          )}

          <EarlierDraftDetails values={source} />
          {expectedImpactSchema.safeParse(source.expectedImpact).success && (
            <div className="border-t pt-5"><ExpectedImpactSummary impact={expectedImpactSchema.parse(source.expectedImpact)} /></div>
          )}
          <RequestReviewSupportingDetails relatedLink={source.usefulLink} files={attachments} />

          {failure?.code === "offline" && (
            // #285 (C1): one cause, one message, on the review step as on Review Request.
            <div ref={reviewFailureRef}><Alert tone="warning" title={OFFLINE_LINE}>{failure.message}</Alert></div>
          )}
          {failure && failure.code !== "offline" && (
            <div ref={reviewFailureRef}><IntakeNotice error title={editing ? "Changes not saved" : "Request not created"}>
              <span>{failure.message}</span>
              {failure.code === "session_expired" && (
                <>
                  {" "}
                  <Link
                    href="/login#/?redirect_url=%2Fintake"
                    onClick={preserveDraftForSignIn}
                    className="font-medium text-foreground underline underline-offset-4"
                  >
                    Sign in again
                  </Link>
                </>
              )}
            </IntakeNotice></div>
          )}

        </div>
      )}

      {(stage === "uploading" || stage === "attachment_recovery") &&
        createdRequestId && (
          <div className={cn(reveal, "space-y-6")}>
            <header className="space-y-2">
              <h2
                ref={headingRef}
                tabIndex={-1}
                className="text-lg font-medium"
                data-composer-autofocus=""
              >
                {stage === "uploading"
                  ? "Uploading files"
                  : hasPendingUploads
                    ? "Some files weren’t uploaded"
                    : "Your Request is ready"}
              </h2>
              <p
                className={cn(
                  "text-sm leading-relaxed",
                  "text-muted-foreground",
                )}
              >
                {stage === "uploading"
                  ? "Keep this tab open while the selected files upload."
                  : hasPendingUploads
                    ? "One or more files need attention. Retry them, remove them, or continue without them."
                    : "Your Request is saved. Open it to continue."}
              </p>
            </header>

            <IntakeAttachmentList items={attachments} mode={stage === "uploading" ? "uploading" : "recovery"}
              disabled={mutationBusy} onRetry={(item) => retryAttachments([item])}
              onRemove={removeFailedFile} emptyFocusRef={headingRef} />

            {stage === "attachment_recovery" && hasPendingUploads && (
              <div className="flex flex-col gap-3 sm:flex-row">
                <Button
                  type="button"
                  className="sm:flex-1"
                  onClick={() => void retryFailedFiles()}
                  disabled={mutationBusy}
                >
                  <RotateCcwIcon
                    aria-hidden="true"
                    data-icon="inline-start"
                  />
                  Retry failed files
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  className="sm:flex-1"
                  onClick={() => void continueWithoutFailedFiles()}
                  disabled={mutationBusy}
                >
                  Skip failed files
                </Button>
              </div>
            )}
            {stage === "attachment_recovery" && !hasPendingUploads && (
              <Button
                type="button"
                onClick={() => void session.continueWithout({ open: true })}
              >
                Open Request
              </Button>
            )}
          </div>
        )}
        {stage === "uploads_checking" && (
          // Plan item 2.3 (S3): which files were lost is known once each
          // reservation is checked, so no list shows before then.
          <Placeholder label="Checking your files" lines={3} />
        )}
        {stage === "uploads_lost" && lostUploads && (
          <div className={cn(reveal, "space-y-6")}>
            <header className="space-y-2">
              <h2 ref={headingRef} tabIndex={-1} className="text-lg font-medium" data-composer-autofocus="">Some files weren’t added</h2>
              <p className={styles.intro}>
                Your Request is saved. These files did not finish uploading, and their contents are no longer available here. Check the Request before adding them again.
              </p>
            </header>
            <IntakeAttachmentList items={lostUploads.files} mode="lost" />
            <div className="flex flex-wrap gap-2">
              <Button type="button" onClick={openLostRequest}>Open Request</Button>
              <Button type="button" variant="secondary" onClick={() => void session.recover()} disabled={mutationBusy}>Retry cleanup</Button>
              <Button type="button" variant="ghost" onClick={dismissLostUploads}>Dismiss</Button>
            </div>
          </div>
        )}
      </div>
      {composing && (
        <footer className={styles.footer}>
          {descriptionUnchanged && resetNote && !guardrailEditing && <p id="intake-review-reset" className={styles.resetNote}>{resetNote}</p>}
          <div className={styles.actions}>
            {guardrailEditing && !checking && <p id="intake-guardrail-pending" className={styles.footerNote}>Complete or remove the guardrail to review your Request.</p>}
            {shortcut}
            <Button ref={submitRef} type="submit" form={formId} disabled={projectBusy || metricBusy || guardrailEditing} loading={checking} aria-keyshortcuts="Meta+Enter Control+Enter"
              aria-describedby={guardrailEditing && !checking ? "intake-guardrail-pending" : descriptionUnchanged && resetNote ? "intake-review-reset" : undefined}>
              {descriptionUnchanged ? editing?.saveLabel ?? "Save changes" : "Review Request"}
            </Button>
          </div>
        </footer>
      )}
      {reviewing && triage && source && (
        <footer className={styles.footer}>
          {resetNote && <p id="intake-review-reset" className={styles.resetNote}>{resetNote}</p>}
          <div className={styles.actions}>
            <Button type="button" variant="ghost" className={styles.lead} onClick={() => {
              setFailure(null);
              setStage("compose");
            }} disabled={creating}>{editing?.backLabel ?? "Edit Request"}</Button>
            {!creating && shortcut}
            <Button
              type="button"
              aria-describedby={resetNote ? "intake-review-reset" : undefined}
              onClick={
                failure?.code === "review_expired"
                  ? () => source && void checkFraming(source)
                  : () => void onConfirm()
              }
              loading={creating}
              aria-keyshortcuts="Meta+Enter Control+Enter"
            >
              {failure?.code === "review_expired" && !creating
                ? "Review again"
                : editing ? editing.saveLabel ?? "Save changes" : "Create Request"}
            </Button>
          </div>
        </footer>
      )}
    </div>
  );
}
