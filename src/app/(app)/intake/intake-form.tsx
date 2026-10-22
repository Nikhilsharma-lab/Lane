"use client";

import pickerLayout from "@/components/requests/request-picker-layout.module.css";
import { RequestLabelsPicker, RequestLabels } from "@/components/requests/request-labels";
import { requestLabelKeys, labelRequestType } from "@/lib/request-labels";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Fragment,
  memo,
  useCallback,
  useEffect,
  useEffectEvent,
  useId,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  CheckIcon,
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
import { savedFraming, storedShape } from "@/lib/request-framing";
import { IntakeNavigationGuard } from "@/components/requests/intake-navigation-guard";
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
  TITLE_MAX,
  USEFUL_LINK_MAX,
  type RequestInput,
} from "@/lib/request-schema";
import { cn } from "@/lib/utils";
import type { OverviewRequest } from "@/lib/request-overview";
import { WORKSPACE_SWITCH_EVENT } from "@/lib/workspace-switch-guard";
import { clearUnfinishedUploads, readLostUploads, readUnfinishedUploads, writeUnfinishedUploads, type UnfinishedUploads } from "@/lib/unfinished-uploads";
import { usePendingMutationWriter } from "@/components/requests/pending-mutations-provider";
import { requestCreatedToast } from "@/components/requests/request-created-toast";
import { ProjectPicker, RequestPriorityPicker, useWorkspaceProjects, pickerPopoverProps } from "@/components/requests/request-property-pickers";
import { RequestReviewersPicker, reviewerSummary, type ReviewerChoice } from "@/components/requests/request-reviewers-picker";
import { REQUEST_PRIORITY_LABELS } from "@/lib/request-constants";
import { expectedImpactDraftSchema, expectedImpactSchema, hasGuardrailEdits, type ExpectedImpactDraft } from "@/lib/request-impact";
import { createEmptyMeasurementPlan } from "@/lib/request-measurement";
import { MeasurementPlanFields } from "@/components/requests/measurement-plan-fields";
import { ExpectedImpactSummary } from "@/components/requests/expected-impact-summary";
import { RequestReviewSupportingDetails } from "@/components/requests/request-review-supporting-details";

import type { RequestDetail } from "@/components/requests/detail-view";
import { requestEditValues, requestEditSnapshot, requestEditSchema, requestEditSourceSchema } from "@/lib/request-edit";
import { EMPTY_METRIC_IMPACT } from "@/lib/request-impact";
import { saveRequestEdits } from "../requests/[id]/edit-actions";
import { useOptimisticAction, useServerRefresh } from "@/components/requests/use-optimistic-action";

import styles from "./intake-form.module.css";

import {
  discardAttachmentUpload,
  finalizeAttachmentUpload,
  prepareAttachmentUpload,
} from "./attachment-actions";
import {
  runTriage,
  saveRequest,
  type SaveResponse,
  type TriageResponse,
} from "./actions";
import { composerDraft, restoredComposer, settleLostUploads as settleInterruptedUploads } from "./intake-session";
import { createUploadSession, uploadToSignedUrl, type QueuedAttachment } from "./intake-uploads";
import { gateFailureNotice, thrownGateFailure, type GateFailure } from "./gate-failure";
import { callAction } from "@/lib/action-call";
import { Skeleton } from "@/components/arc/skeleton/skeleton";

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

/** Files a reload interrupted after the Request was created (plan item 2.3, S3). */
type LostUploads = { requestId: string; files: { key: string; name: string }[] };


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
      {error && <p role="alert" className="text-destructive-foreground">{error}</p>}
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

export default function RequestEditor({
  context,
  draftOwnerId,
  active = true,
  onCreated,
  onBusyChange,
  onCancelCheckChange,
  initialProjectId = null,
  editing,
  canAddReviewers = false,
}: {
  context: { orgId: string };
  draftOwnerId: string;
  active?: boolean;
  /** The Request exists and the composer is done. `open` asks to go to it now; `created` is its list row. */
  onCreated?: (requestId: string, options: { open: boolean; created?: OverviewRequest }) => void;
  onBusyChange?: (busy: boolean) => void;
  /** Decision 2026-10-21 (critique 2.3): a way to abandon the problem check while it runs, null otherwise. The composer's X and Esc use it. */
  onCancelCheckChange?: (cancel: (() => void) | null) => void;
  initialProjectId?: string | null;
  editing?: { request: RequestDetail; onSaved: () => void };
  /** #78: non-guests can ask people to review while creating. Not offered when editing. */
  canAddReviewers?: boolean;
}) {
  const router = useRouter();
  const optimistic = useOptimisticAction();
  const refresh = useServerRefresh();
  const [original] = useState(() => editing ? requestEditValues(editing.request) : null);
  const [snapshot] = useState(() => editing ? requestEditSnapshot(editing.request) : null);
  const [initialValues] = useState<RequestInput>(() => original
    ? { ...original, expectedImpact: original.expectedImpact ?? { ...EMPTY_METRIC_IMPACT, unit: "" } }
    : emptyRequest);
  const [savedProblem, setSavedProblem] = useState(original?.reframedProblem ?? null);
  const [savedSolution, setSavedSolution] = useState(original?.extractedSolution ?? null);
  const [framingError, setFramingError] = useState<{ field: "reframedProblem" | "extractedSolution"; message: string } | null>(null);
  const problemFieldRef = useRef<HTMLTextAreaElement>(null);
  const solutionFieldRef = useRef<HTMLTextAreaElement>(null);
  const { toast } = useToastStack();
  const [stage, setStage] = useState<Stage>("compose");
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
  const [attachments, setAttachments] = useState<QueuedAttachment[]>([]);
  const [reviewers, setReviewers] = useState<ReviewerChoice[]>([]);
  const [reviewQuestion, setReviewQuestion] = useState("");
  const [reviewersError, setReviewersError] = useState<string | null>(null);
  const offerReviewers = canAddReviewers && !editing;
  const [createdRequestId, setCreatedRequestId] = useState<string | null>(null);
  // The saved row, handed to the composer so the list shows it at once.
  const createdRow = useRef<OverviewRequest | null>(null);
  const pendingWriter = usePendingMutationWriter();
  const [lostUploads, setLostUploads] = useState<LostUploads | null>(null);
  const [projectBusy, setProjectBusy] = useState(false);
  const projectInFlight = useRef(false);
  const projectDefaultApplied = useRef(false);
  const draftEdited = useRef(false);
  const [mutationBusy, setMutationBusy] = useState(false);

  const operationInFlight = useRef(false);
  // Each problem check's number; a cancelled check's late answer no longer matches and is ignored.
  const checkRun = useRef(0);
  // Plan item 2.3 (S3): the person chose Leave page in the navigation guard,
  // which stops the uploads; or this composer unmounted (its host left: the
  // layout leaves, or a workspace switch re-keys it), which lets them finish
  // without it.
  const leftUploadScreen = useRef(false);
  const unmounted = useRef(false);
  // Plan item 2.3 (S3): the created Request whose files this composer still
  // owes, from the first upload until they finish or are left; and the upload
  // reservations not yet finalized or discarded, by file key.
  const uploadsRequest = useRef<string | null>(null);
  const reservations = useRef(new Map<string, string>());
  // Each lost-uploads check takes a number; resolving the step or unmounting
  // takes the next, so an older check never writes the record again.
  const lostCheck = useRef(0);
  const draftCleared = useRef(false);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const submitRef = useRef<HTMLButtonElement>(null);
  const failureRef = useRef<HTMLDivElement>(null);
  // Where focus goes when the compose step shows again: the title by default,
  // the primary button after a gate failure, nowhere when a field takes it.
  const focusAfterCompose = useRef<"title" | "submit" | "none">("title");
  const formId = useId();
  const problemRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const composeFormRef = useRef<HTMLFormElement>(null);
  const attachFilesButtonRef = useRef<HTMLButtonElement>(null);
  const [previousProblem, setPreviousProblem] = useState("");
  const [previousProblemSource, setPreviousProblemSource] = useState<Pick<RequestInput, "title" | "description"> | null>(null);
  const draftScope = intakeDraftScope(draftOwnerId, context.orgId) + (editing ? `:edit:${editing.request.id}` : "");
  // The created Request's files: reserve, store, finalise, recover (intake-uploads.ts).
  // All of its state lives in the refs above, so each handler builds it afresh
  // with the current render's values, as the handlers themselves did before.
  const uploads = () => createUploadSession({
    refs: { operationInFlight, leftUploadScreen, unmounted, uploadsRequest, reservations },
    prepare: (input) => callAction(() => prepareAttachmentUpload(input, context)),
    finalize: (input) => callAction(() => finalizeAttachmentUpload(input, context)),
    discard: (input) => callAction(() => discardAttachmentUpload(input, context)),
    put: uploadToSignedUrl,
    record: {
      read: () => readUnfinishedUploads(window.sessionStorage, draftScope),
      write: (record) => { writeUnfinishedUploads(window.sessionStorage, draftScope, record); },
      clear: () => clearUnfinishedUploads(window.sessionStorage, draftScope),
    },
    setAttachments,
    setBusy: (busy) => { setMutationBusy(busy); onBusyChange?.(busy); },
    finish: (requestId) => finishCreatedRequest(requestId),
  });

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
    resolver: zodResolver(editing ? requestEditSourceSchema : requestSchema),
    defaultValues: initialValues,
  });

  // Typing in the title and description renders nothing: both fields are uncontrolled, and the
  // form watches only the values it shows (the properties row, the earlier-draft details, the
  // measurement editor's own value). A whole-form watch would hand out a fresh clone of every
  // value on each keystroke and render the entire composer with it. The draft is persisted on
  // every change through the render-free subscription below.
  const [affectedPeople, desiredChange, observedEvidence, uncertainty, projectId, requestType, priority, labelKeys] = useWatch({ control, name: shownFields });
  const originalTextUnchanged = useWatch({ control, name: ["title", "description"], compute: ([title, description]) => Boolean(editing && original && title?.trim() === original.title && description?.trim() === original.description) });
  const hasLink = useWatch({ control, name: "usefulLink", compute: hasText });
  // Expected impact keeps its identity until its content changes, so the measurement editor can
  // skip every render its own value did not cause.
  const expectedImpact = useWatch({ control, name: "expectedImpact", compute: parseExpectedImpact });
  const changeExpectedImpact = useCallback((value: ExpectedImpactDraft) => {
    draftEdited.current = true;
    setValue("expectedImpact", value, { shouldDirty: true, shouldValidate: isSubmitted });
  }, [isSubmitted, setValue]);
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

  // Plan item 2.3 (S3): after a reload, each recorded reservation is cleared;
  // a file that did finish drops off the list, and the rest are named honestly.
  // The list waits for the answer. When every file had finished, nothing was
  // lost and the flow ends as a creation does.
  const settleLostUploads = useEffectEvent(async (lost: UnfinishedUploads) => {
    const check = ++lostCheck.current;
    const kept = await settleInterruptedUploads(lost, (input) => callAction(() => discardAttachmentUpload(input, context)));
    if (check !== lostCheck.current) return;
    if (!kept.length) {
      finishCreatedRequest(lost.requestId);
      return;
    }
    writeUnfinishedUploads(window.sessionStorage, draftScope, { ...lost, files: kept });
    setLostUploads({ requestId: lost.requestId, files: kept.map(({ key, name }) => ({ key, name })) });
    setStage("uploads_lost");
  });

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
    const lost = readLostUploads(window.sessionStorage, draftScope);
    const draft = lost ? null : readIntakeDraft(window.sessionStorage, draftScope);
    const restoreTimer = window.setTimeout(() => {
      if (lost) {
        setStage("uploads_checking");
        void settleLostUploads(lost);
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
        if (restored.review) {
          setTriage(restored.review.triage);
          setToken(restored.review.token);
          setEditedProblem(restored.review.editedProblem);
          setStage("framing");
        } else {
          setStage("compose");
        }
      }

      setDraftReady(true);
    }, 0);

    return () => {
      window.clearTimeout(restoreTimer);
    };
  }, [draftScope, reset, snapshot]);

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
  const currentDraft = () => composerDraft({ stage, triage, token, editedProblem, source, values: getValues(), previousProblem, previousProblemSource, reviewers: reviewersDraft });
  const persistDraft = useEffectEvent(() => {
    if (!draftReady || draftCleared.current || stage === "uploads_checking" || stage === "uploads_lost") return true;
    try {
      return writeIntakeDraft(window.sessionStorage, draftScope, currentDraft());
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
  ]);
  // Every value change, keystrokes included, without a render of the form.
  useEffect(() => subscribe({ formState: { values: true }, callback: () => { persistDraft(); } }), [subscribe]);

  useEffect(() => {
    if (!active || !draftReady) return;
    if (stage !== "compose") {
      headingRef.current?.focus();
      return;
    }
    const target = focusAfterCompose.current;
    focusAfterCompose.current = "title";
    if (target === "title") setFocus("title");
    else if (target === "submit") {
      submitRef.current?.focus();
      failureRef.current?.scrollIntoView({ block: "nearest" });
    }
  }, [active, draftReady, setFocus, stage]);

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
    (checking || creating || stage === "uploading" || mutationBusy || projectBusy);
  useEffect(() => {
    onBusyChange?.(busy);
  }, [busy, onBusyChange]);
  // An unmounted form leaves no stale cancel behind in the composer.
  useEffect(() => () => onCancelCheckChange?.(null), [onCancelCheckChange]);

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

  // The checking step announces itself through its own visible status.
  // Plan item 2.3 (S3): while files upload after creation, this tab remembers
  // which have not finished, so a reload can say so instead of losing them silently.
  useEffect(() => {
    if (!createdRequestId || leftUploadScreen.current || (stage !== "uploading" && stage !== "attachment_recovery")) return;
    writeUnfinishedUploads(window.sessionStorage, draftScope, {
      requestId: createdRequestId,
      title: source?.title ?? "",
      files: attachments
        .filter((attachment) => attachment.status !== "uploaded")
        .map((attachment) => ({ key: attachment.key, name: attachment.file.name, attachmentId: attachment.attachmentId })),
    });
  }, [attachments, createdRequestId, draftScope, source, stage]);

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

  function cancelCheck() {
    checkRun.current += 1;
    operationInFlight.current = false;
    onCancelCheckChange?.(null);
    // The draft was never left: the form comes back as it was, with Review Request ready to try again.
    focusAfterCompose.current = "submit";
    setStage("compose");
  }

  async function checkFraming(data: RequestInput) {
    if (operationInFlight.current) return;
    operationInFlight.current = true;
    const run = ++checkRun.current;
    const abandoned = () => checkRun.current !== run;
    setLinkOpen(false);
    onBusyChange?.(true);
    setRestoredDraft(false);
    setFailure(null);
    setProblemError(null);
    const keepEarlierProblem = previousProblemSource?.title === data.title && previousProblemSource?.description === data.description;
    setSource(data);
    setShowSlowCue(false);
    setStage("checking");
    onCancelCheckChange?.(cancelCheck);

    try {
      // callAction refreshes a lapsed session first and retries an ended one
      // once, so "session_expired" here means the person must sign in again.
      const result: TriageResponse = await callAction(() => editing ? runTriage(data, context, editing.request.id) : runTriage(data, context));
      if (abandoned()) return;
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
            const focusTimeout = window.setTimeout(() => focusRequestField(field), 0);
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
    } catch {
      if (abandoned()) return;
      setFailure(thrownGateFailure(navigator.onLine !== false));
      focusAfterCompose.current = "submit";
      setStage("compose");
    } finally {
      // A cancelled check has already handed the form back; a newer check may own these now.
      if (!abandoned()) {
        operationInFlight.current = false;
        onBusyChange?.(false);
        onCancelCheckChange?.(null);
      }
    }
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

  function finishCreatedRequest(requestId: string, { open = false }: { open?: boolean } = {}) {
    if (leftUploadScreen.current) return;
    uploadsRequest.current = null;
    clearUnfinishedUploads(window.sessionStorage, draftScope);
    setStage("complete");
    if (editing) {
      onBusyChange?.(false);
      editing.onSaved();
      refresh();
      return;
    }
    if (onCreated) {
      onBusyChange?.(false);
      onCreated(requestId, { open, created: createdRow.current?.id === requestId ? createdRow.current : undefined });
      return;
    }
    if (!open) toast(requestCreatedToast({}));
    router.push(`/requests/${requestId}`);
  }

  const onUnmount = useEffectEvent(() => {
    lostCheck.current += 1;
    uploads().unmount();
  });
  useEffect(() => {
    unmounted.current = false;
    return () => onUnmount();
  }, []);

  function openLostRequest() {
    if (!lostUploads) return;
    lostCheck.current += 1;
    clearUnfinishedUploads(window.sessionStorage, draftScope);
    setStage("complete");
    if (onCreated) onCreated(lostUploads.requestId, { open: true });
    else router.push(`/requests/${lostUploads.requestId}`);
  }

  function dismissLostUploads() {
    lostCheck.current += 1;
    clearUnfinishedUploads(window.sessionStorage, draftScope);
    setLostUploads(null);
    setStage("compose");
  }

  async function onConfirm(unchangedSource?: RequestInput) {
    const savingSource = unchangedSource ?? source;
    if (operationInFlight.current || !savingSource || (!unchangedSource && (!triage || !token))) return;
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

    operationInFlight.current = true;
    onBusyChange?.(true);
    setRestoredDraft(false);
    setFailure(null);
    setProblemError(null);
    setStage("creating");

    try {
      const payload = {
        token: token!,
        editedProblemText:
          triage?.classification === "problem" ? null : editedProblem,
      };
      // Saving is idempotent by the review's requestId, so callAction's one
      // retry after an ended session can never create the Request twice.
      const result: SaveResponse = editing && original
        ? await (async (): Promise<SaveResponse> => {
          const changes = { ...savingSource,
            expectedImpact: original.expectedImpact === null && JSON.stringify(savingSource.expectedImpact) === JSON.stringify(initialValues.expectedImpact) ? null : savingSource.expectedImpact,
            reframedProblem: unchangedSource ? savedProblem : triage?.classification === "problem" ? null : editedProblem,
            extractedSolution: unchangedSource ? savedSolution : triage?.extractedSolution ?? null,
          };
          const parsed = requestEditSchema.safeParse(changes);
          if (!parsed.success) return { success: false, error: { code: "save_failed", message: parsed.error.issues[0].message } };
          const outcome = await optimistic({ id: editing.request.id, waitForPending: true, refreshOnError: false,
            run: () => saveRequestEdits(editing.request.id, { snapshot, changes: parsed.data, token: unchangedSource ? undefined : token ?? undefined }, context),
            onError: () => {},
          });
          return outcome.status === "success" ? { success: true, requestId: editing.request.id }
            : { success: false, error: { code: "save_failed", message: outcome.status === "error" ? outcome.error : "This Request has a pending change. Try again." } };
        })()
        : await (async () => {
          // #78: the picks travel beside the signed review and are checked on their own.
          const picks = offerReviewers && reviewers.length ? { nominees: reviewers.map((person) => person.nominee), note: reviewQuestion } : undefined;
          return callAction(() => saveRequest(payload, context, picks));
        })();

      if (!result.success) {
        if (result.error.code === "validation" && (result.error.field === "projectId" || result.error.field === "requestType" || result.error.field === "expectedImpact")) {
          const field = result.error.field;
          setError(field, { type: "server", message: result.error.message });
          focusAfterCompose.current = "none";
          setStage("compose");
          const focusTimeout = window.setTimeout(() => focusRequestField(field), 0);
          return () => window.clearTimeout(focusTimeout);
        }
        if (result.error.field === "reviewers") {
          // Nothing was created: back to the compose step, where the picker shows why.
          setReviewersError(result.error.message);
          focusAfterCompose.current = "none";
          setStage("compose");
          const focusTimeout = window.setTimeout(() => document.getElementById("intake-reviewers")?.focus(), 0);
          return () => window.clearTimeout(focusTimeout);
        }
        if (
          result.error.code === "validation" &&
          result.error.field === "editedProblemText"
        ) {
          setProblemError(result.error.message);
          const focusTimeout = window.setTimeout(() => problemRef.current?.focus(), 0);
          return () => window.clearTimeout(focusTimeout);
        } else {
          setFailure(result.error);
        }
        setStage(unchangedSource ? "compose" : "framing");
        return;
      }

      setCreatedRequestId(result.requestId);
      showCreatedInList(result.created);
      draftCleared.current = true;
      clearIntakeDraft(window.sessionStorage, draftScope);

      // A composer whose host unmounted while the save was pending renders
      // nothing. The row is in the list; no toast or navigation pulls the
      // person from where they went.
      if (attachments.length === 0) {
        if (!uploads().unattended()) finishCreatedRequest(result.requestId);
        return;
      }

      setStage("uploading");
      // The upload screen's effect keeps the record too, but a composer
      // unmounted during the save never renders it, so uploadSaved starts it.
      const uploaded = await uploads().uploadSaved(result.requestId, savingSource.title, attachments);
      if (uploaded === "uploaded") finishCreatedRequest(result.requestId);
      else if (uploaded === "recovery") setStage("attachment_recovery");
    } catch {
      setFailure({
        code: "save_failed",
        message:
          editing ? "Your changes could not be saved. Your text is still here. Try again." : "Your Request could not be created. Your text is still here. Try again.",
      });
      setStage(unchangedSource ? "compose" : "framing");
    } finally {
      operationInFlight.current = false;
      // A composer mounted since then owns the busy flag.
      if (!unmounted.current) onBusyChange?.(false);
      uploads().settleLeft();
    }
  }


  async function retryAttachments(failed: QueuedAttachment[]) {
    if (createdRequestId) await uploads().retry(failed, attachments, createdRequestId);
  }

  async function retryFailedFiles() {
    await retryAttachments(attachments.filter((attachment) => attachment.status === "failed"));
  }

  async function removeFailedFile(attachment: QueuedAttachment) {
    if (createdRequestId) await uploads().remove(attachment, createdRequestId);
  }

  async function continueWithoutFailedFiles() {
    if (createdRequestId) await uploads().continueWithout(attachments, createdRequestId);
  }



  function preserveDraftForSignIn() {
    writeIntakeDraft(window.sessionStorage, draftScope, currentDraft());
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
  // Incomplete guardrails and recovered pending changes must be resolved first.
  const guardrailEditing = hasGuardrailEdits(currentValues.expectedImpact);
  const reviewing = stage === "framing" || creating;
  // Compose shows gate failures; review-step failures keep their own alert.
  const gateNotice = composing && failure ? gateFailureNotice(failure) : null;
  const shortcut = shortcutHint && <kbd className={styles.shortcut} aria-hidden="true">{shortcutHint}</kbd>;

  function onProjectBusyChange(value: boolean) {
    projectInFlight.current = value;
    setProjectBusy(value);
    onBusyChange?.(value);
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
    if (!active || checking || projectInFlight.current || hasGuardrailEdits(getValues("expectedImpact"))) return;
    const invalidNumber = [...(composeFormRef.current?.querySelectorAll<HTMLInputElement>('input[type="number"]') ?? [])]
      .find(input => !input.disabled && (input.validity.badInput || input.validity.customError));
    if (invalidNumber) {
      invalidNumber.focus();
      invalidNumber.reportValidity();
      return;
    }
    onBusyChange?.(true);
    void handleSubmit(data => {
      if (original && editing && data.title.trim() === original.title && data.description.trim() === original.description) {
        // Unchanged wording keeps its judgement, so its framing can be reworded but not emptied.
        const framing = savedFraming(storedShape({ classification: editing.request.classification, reframedProblem: original.reframedProblem, extractedSolution: original.extractedSolution }), { reframedProblem: savedProblem, extractedSolution: savedSolution });
        if (!framing.ok) {
          onBusyChange?.(false);
          setFramingError(framing);
          (framing.field === "reframedProblem" ? problemFieldRef : solutionFieldRef).current?.focus();
          return;
        }
        void onConfirm(data);
      } else void checkFraming(data);
    }, (fieldErrors) => {
      onBusyChange?.(false);
      const firstField = Object.keys(fieldErrors)[0] as keyof RequestInput | undefined;
      if (!firstField) return;
      if (firstField !== "title" && firstField !== "description") {
        if (firstField === "usefulLink") setLinkOpen(true);
        focusRequestField(firstField);
      }
    })();
  }

  return (
    <div
      className={cn(styles.composer, styles.dialog)}
      onKeyDown={onComposerKeyDown}
    >
      {active && stage !== "complete" && (creating || hasPendingUploads) && (
        <IntakeNavigationGuard creating={creating} onLeave={() => uploads().leave()} />
      )}
      <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {active ? liveStatus : ""}
      </p>
      <div className={styles.scroll}>
        {composing && (
          <form
            id={formId}
            ref={composeFormRef}
            hidden={checking}
            noValidate
            onChangeCapture={() => { draftEdited.current = true; }}
            aria-busy={checking || projectBusy || undefined}
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
            className="space-y-5"
          >
            {restoredDraft && (
              <IntakeNotice attention>
                Your text and links were restored. Choose any files again before creating the Request.
              </IntakeNotice>
            )}
            <div className="space-y-2">
              <Input
                label="Request title"
                hideLabel
                appearance="plain"
                id="intake-title"
                placeholder="Request title"
                maxLength={TITLE_MAX}
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
              <Textarea
                label="Description"
                hideLabel
                appearance="plain"
                id="intake-description"
                placeholder="Add a description…"
                rows={3}
                maxLength={DESCRIPTION_MAX}
                readOnly={checking}
                className={styles.description}
                error={errors.description?.message}
                {...register("description")}
              />
            </div>

            <div className="flex flex-wrap items-center gap-2" aria-label="Request properties and supporting details">
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
                    <Button type="button" variant="secondary" size="sm" onClick={() => void finishLink()}>Done</Button>
                  </div>
                </PopoverContent>
              </Popover>
              <Button ref={attachFilesButtonRef} type="button" variant="ghost" size="sm" onClick={() => fileInputRef.current?.click()} disabled={checking}>
                <span className={styles.propertyContent}><PaperclipIcon aria-hidden="true" /><span>Attach files</span></span>
              </Button>
              <input ref={fileInputRef} type="file" aria-label="Choose Request files" tabIndex={-1} multiple accept={ATTACHMENT_ACCEPT} className="sr-only" disabled={checking}
                onChange={(event) => { addFiles(Array.from(event.target.files ?? [])); event.target.value = ""; }} />
            </div>
            {errors.projectId && <p id="intake-project-error" role="alert" className="text-destructive-foreground">{errors.projectId.message}</p>}
            {errors.requestType && <p id="intake-request-type-error" role="alert" className="text-destructive-foreground">{errors.requestType.message}</p>}
            {offerReviewers && reviewersError && <p id="intake-reviewers-error" role="alert" className="text-destructive-foreground">{reviewersError}</p>}
            {currentValues.expectedImpact && <>
              {errors.expectedImpact?.type === "server" && errors.expectedImpact.message && (
                <Alert tone="danger" title="Check measurement">{errors.expectedImpact.message}</Alert>
              )}
              {!editing && currentValues.expectedImpact.kind !== "measurement" && errors.expectedImpact && errors.expectedImpact.type !== "server" && (
                <Alert tone="danger" title="Check measurement">Complete the metric or verified result and measurement window before reviewing.</Alert>
              )}
              <PlanFields
              value={currentValues.expectedImpact}
              onChange={changeExpectedImpact}
              requestType={currentValues.requestType ?? null}
              disabled={checking}
              submitted={isSubmitted}
            /></>}
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
                {creating ? "Saving changes…" : showSlowCue ? "Still checking. Your draft is kept." : "Checking whether this describes a problem…"}
              </p>
            </div>
            <div aria-hidden="true" className="space-y-6">
              <Skeleton lines={2} />
              <Skeleton lines={4} />
              <div className="border-t pt-5"><Skeleton lines={3} /></div>
            </div>
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
              <p className="max-w-[62ch] text-pretty text-sm leading-relaxed text-muted-foreground">
                {aiAttribution[triage.classification]}
              </p>
            )}
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
            {(source.projectId || requestLabelKeys(source).length > 0 || (source.priority && source.priority !== "none")) && (
              <p className="text-sm text-muted-foreground">
                {[
                  source.projectId ? projects.projects.find((project) => project.id === source.projectId)?.name ?? "Selected Project" : null,
                  null,
                  source.priority && source.priority !== "none" ? REQUEST_PRIORITY_LABELS[source.priority] : null,
                ].filter((part): part is string => part !== null).map((part, index) => <Fragment key={part}>{index > 0 && ", "}<span>{part}</span></Fragment>)}
              </p>
            )}
            {offerReviewers && reviewers.length > 0 && (
              <p className="text-sm text-muted-foreground" aria-label={`Reviewers: ${reviewers.map((person) => person.name).join(", ")}`}>
                Reviewers: <span title={reviewers.map((person) => person.name).join(", ")}>{reviewers.length > 3 ? reviewerSummary(reviewers) : reviewers.map((person) => person.name).join(", ")}</span>
              </p>
            )}
          </div>

          {triage.classification === "problem" ? (
            <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">{source.description}</p>
          ) : (
            <div className="space-y-5">
              <section
                aria-label="Problem to solve"
                className="min-w-0"
              >
                <div
                  className="data-[invalid=true]:text-destructive-foreground"
                  data-invalid={Boolean(problemError)}
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
                    aria-invalid={Boolean(problemError) || undefined}
                    aria-describedby={
                      problemError
                        ? "problem-framing-error"
                        : "problem-framing-description"
                    }
                    className="min-h-24 resize-y text-sm leading-relaxed"
                  />
                  {problemError ? (
                    <p
                      className="text-destructive-foreground"
                      id="problem-framing-error"
                    >
                      {problemError}
                    </p>
                  ) : (
                    <p id="problem-framing-description">
                      Your original description will also be saved.
                    </p>
                  )}
                </div>
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

          {failure && (
            <IntakeNotice error title={editing ? "Changes not saved" : "Request not created"}>
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
            </IntakeNotice>
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
                onClick={() => finishCreatedRequest(createdRequestId, { open: true })}
              >
                Open Request
              </Button>
            )}
          </div>
        )}
        {stage === "uploads_checking" && (
          // Plan item 2.3 (S3): which files were lost is known once each
          // reservation is checked, so no list shows before then.
          <Skeleton label="Checking your files" lines={3} />
        )}
        {stage === "uploads_lost" && lostUploads && (
          <div className={cn(reveal, "space-y-6")}>
            <header className="space-y-2">
              <h2 ref={headingRef} tabIndex={-1} className="text-lg font-medium" data-composer-autofocus="">Some files weren’t added</h2>
              <p className="max-w-[62ch] text-pretty text-sm leading-relaxed text-muted-foreground">
                Your Request was created, but the page reloaded before these files finished uploading, so they weren’t added. Mention them in a comment if your team needs them.
              </p>
            </header>
            <IntakeAttachmentList items={lostUploads.files} mode="lost" />
            <div className="flex flex-wrap gap-2">
              <Button type="button" onClick={openLostRequest}>Open Request</Button>
              <Button type="button" variant="ghost" onClick={dismissLostUploads}>Dismiss</Button>
            </div>
          </div>
        )}
      </div>
      {composing && (
        <footer className={styles.footer}>
          <div className={styles.actions}>
            {guardrailEditing && !checking && <p id="intake-guardrail-pending" className={styles.footerNote}>Complete or remove the guardrail to review your Request.</p>}
            {shortcut}
            <Button ref={submitRef} type="submit" form={formId} disabled={projectBusy || guardrailEditing} loading={checking} aria-keyshortcuts="Meta+Enter Control+Enter"
              aria-describedby={guardrailEditing && !checking ? "intake-guardrail-pending" : undefined}>
              {originalTextUnchanged ? "Save changes" : "Review Request"}
            </Button>
          </div>
        </footer>
      )}
      {reviewing && triage && source && (
        <footer className={styles.footer}>
          <div className={styles.actions}>
            <Button type="button" variant="ghost" className={styles.lead} onClick={() => {
              setFailure(null);
              setStage("compose");
            }} disabled={creating}>Edit Request</Button>
            {!creating && shortcut}
            <Button
              type="button"
              onClick={
                failure?.code === "review_expired"
                  ? () => source && void checkFraming(source)
                  : () => void onConfirm()
              }
              loading={creating}
              aria-keyshortcuts="Meta+Enter Control+Enter"
            >
              {creating
                ? editing ? "Saving changes…" : "Creating Request…"
                : failure?.code === "review_expired"
                  ? "Review again"
                  : editing ? "Save changes" : "Create Request"}
            </Button>
          </div>
        </footer>
      )}
    </div>
  );
}
