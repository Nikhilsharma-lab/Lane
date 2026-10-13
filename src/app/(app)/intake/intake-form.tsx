"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Fragment,
  useCallback,
  useEffect,
  useEffectEvent,
  useId,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { flushSync } from "react-dom";
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
import { Textarea } from "@/components/arc/textarea/textarea";
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
import { clearUnfinishedUploads, readLostUploads, readUnfinishedUploads, writeUnfinishedUploads, type UnfinishedUpload, type UnfinishedUploads } from "@/lib/unfinished-uploads";
import { usePendingMutationWriter } from "@/components/requests/pending-mutations-provider";
import { requestCreatedToast } from "@/components/requests/request-created-toast";
import { ProjectPicker, RequestTypePicker, useWorkspaceProjects } from "@/components/requests/request-property-pickers";
import { REQUEST_TYPE_LABELS } from "@/lib/request-constants";
import { EMPTY_METRIC_IMPACT, expectedImpactDraftSchema, expectedImpactSchema, hasGuardrailEdits, requiredExpectedImpactSchema } from "@/lib/request-impact";
import { ExpectedImpactSummary } from "@/components/requests/expected-impact-summary";
import { RequestReviewSupportingDetails } from "@/components/requests/request-review-supporting-details";
import type { z } from "zod";
import styles from "./intake-form.module.css";
import { ExpectedImpactDisclosure, firstImpactField, IMPACT_PANEL_ID } from "./expected-impact-disclosure";

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
import { gateFailureNotice, thrownGateFailure, type GateFailure } from "./gate-failure";
import { refreshClerkToken } from "@/components/requests/use-optimistic-action";
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

type QueuedAttachment = {
  key: string;
  file: File;
  status: "queued" | "uploading" | "uploaded" | "failed";
  progress: number;
  attachmentId: string | null;
  error: string | null;
};

const reveal =
  "motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-2 motion-safe:duration-200 motion-safe:ease-out";

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
  expectedImpact: EMPTY_METRIC_IMPACT,
};

const earlierDraftFields = [
  { name: "affectedPeople", label: "Users" },
  { name: "desiredChange", label: "Expected result" },
  { name: "observedEvidence", label: "Supporting information" },
  { name: "uncertainty", label: "Open questions" },
] as const;

function EarlierDraftDetails({
  values,
  error,
}: {
  values: RequestInput;
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

function uploadToSignedUrl(
  signedUrl: string,
  file: File,
  onProgress: (progress: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const body = new FormData();
    body.append("cacheControl", "0");
    body.append("", file);

    xhr.open("PUT", signedUrl);
    xhr.setRequestHeader("x-upsert", "false");
    xhr.upload.addEventListener("progress", (event) => {
      if (event.lengthComputable) {
        onProgress(Math.round((event.loaded / event.total) * 100));
      }
    });
    xhr.addEventListener("load", () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(new Error(`Upload failed with status ${xhr.status}`));
    });
    xhr.addEventListener("error", () => reject(new Error("Upload failed")));
    xhr.addEventListener("abort", () => reject(new Error("Upload cancelled")));
    xhr.send(body);
  });
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

export default function IntakeForm({
  context,
  draftOwnerId,
  active = true,
  onCreated,
  onBusyChange,
  initialProjectId = null,
}: {
  context: { orgId: string };
  draftOwnerId: string;
  active?: boolean;
  /** The Request exists and the composer is done. `open` asks to go to it now; `created` is its list row. */
  onCreated?: (requestId: string, options: { open: boolean; created?: OverviewRequest }) => void;
  onBusyChange?: (busy: boolean) => void;
  initialProjectId?: string | null;
}) {
  const router = useRouter();
  const { toast } = useToastStack();
  const [stage, setStage] = useState<Stage>("compose");
  const [linkOpen, setLinkOpen] = useState(false);
  const projects = useWorkspaceProjects(context.orgId, active);
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
  // Expected impact starts folded, also after a draft is restored (decision 8.26).
  const [impactOpen, setImpactOpen] = useState(false);
  const [impactInstant, setImpactInstant] = useState(false);

  const operationInFlight = useRef(false);
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
  const attachFilesButtonRef = useRef<HTMLButtonElement>(null);
  const [previousProblem, setPreviousProblem] = useState("");
  const [previousProblemSource, setPreviousProblemSource] = useState<Pick<RequestInput, "title" | "description"> | null>(null);
  const draftScope = intakeDraftScope(draftOwnerId, context.orgId);

  const {
    control,
    register,
    handleSubmit,
    getValues,
    reset,
    setError,
    setFocus,
    setValue,
    formState: { errors, isSubmitted },
  } = useForm<RequestInput, unknown, z.output<typeof requestSchema>>({
    resolver: zodResolver(requestSchema),
    defaultValues: emptyRequest,
  });

  const watched = useWatch({ control });
  const currentValues: RequestInput = useMemo(
    () => ({
      title: watched.title ?? "",
      description: watched.description ?? "",
      affectedPeople: watched.affectedPeople ?? "",
      desiredChange: watched.desiredChange ?? "",
      observedEvidence: watched.observedEvidence ?? "",
      uncertainty: watched.uncertainty ?? "",
      usefulLink: watched.usefulLink ?? "",
      projectId: watched.projectId ?? null,
      requestType: watched.requestType ?? null,
      expectedImpact: expectedImpactDraftSchema.parse(watched.expectedImpact) ?? EMPTY_METRIC_IMPACT,
    }),
    [
      watched.affectedPeople,
      watched.description,
      watched.desiredChange,
      watched.observedEvidence,
      watched.title,
      watched.uncertainty,
      watched.usefulLink,
      watched.projectId,
      watched.requestType,
      watched.expectedImpact,
    ],
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
    const settled = await Promise.all(lost.files.map(async (file): Promise<UnfinishedUpload | null> => {
      if (!file.attachmentId) return file;
      try {
        const result = await discardAttachmentUpload({ requestId: lost.requestId, attachmentId: file.attachmentId }, context);
        if (result.success && result.alreadyUploaded) return null;
        return result.success ? { ...file, attachmentId: null } : file;
      } catch {
        return file;
      }
    }));
    if (check !== lostCheck.current) return;
    const kept = settled.filter((file): file is UnfinishedUpload => file !== null);
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
    const lost = readLostUploads(window.sessionStorage, draftScope);
    const draft = lost ? null : readIntakeDraft(window.sessionStorage, draftScope);
    const restoreTimer = window.setTimeout(() => {
      if (lost) {
        setStage("uploads_checking");
        void settleLostUploads(lost);
      } else if (draft) {
        reset(draft.source);
        setSource(draft.source);
        setFailure(null);
        setProblemError(null);
        setRestoredDraft(true);
        setLinkOpen(Boolean(draft.source.usefulLink));
        setImpactOpen(hasGuardrailEdits(draft.source.expectedImpact));
        setPreviousProblem(draft.previousProblem || draft.review?.editedProblem || "");
        // A stored review knows which text produced its framing. Older compose
        // drafts may retain wording without an origin; show it, but never
        // silently attach it to a different Request.
        setPreviousProblemSource(draft.review?.triage.classification !== "problem" && draft.review
          ? { title: draft.source.title, description: draft.source.description }
          : draft.previousProblemSource ?? null);

        if (draft.review && requiredExpectedImpactSchema.safeParse(draft.source.expectedImpact).success) {
          setTriage(draft.review.triage);
          setToken(draft.review.token);
          setEditedProblem(draft.review.editedProblem);
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
  }, [draftScope, reset]);

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

  const persistDraft = useEffectEvent(() => {
    if (!draftReady || draftCleared.current || stage === "uploads_checking" || stage === "uploads_lost") return true;
    const review =
      (stage === "framing" || stage === "creating") && triage && token
        ? { triage, token, editedProblem }
        : null;
    try {
      return writeIntakeDraft(window.sessionStorage, draftScope, {
        source: review && source ? source : getValues(),
        review,
        previousProblem: editedProblem || previousProblem,
        previousProblemSource,
      });
    } catch { return false; }
  });

  useEffect(() => {
    persistDraft();
  }, [
    currentValues,
    draftReady,
    draftScope,
    editedProblem,
    source,
    stage,
    token,
    triage,
    previousProblem,
    previousProblemSource,
  ]);

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
          ? "Creating the Request."
          : stage === "uploading"
            ? "Uploading Request files."
            : "";

  function updateAttachment(key: string, update: Partial<QueuedAttachment>) {
    // After unmount nothing renders. The record follows the uploads instead,
    // so a reload before they end names only the files that weren't added.
    if (unmounted.current) {
      followUnmountedUpload(key, update);
      return;
    }
    setAttachments((current) =>
      current.map((attachment) =>
        attachment.key === key ? { ...attachment, ...update } : attachment,
      ),
    );
  }

  function followUnmountedUpload(key: string, update: Partial<QueuedAttachment>) {
    if (update.status !== "uploaded" && update.attachmentId === undefined) return;
    const record = readUnfinishedUploads(window.sessionStorage, draftScope);
    if (!record || record.requestId !== uploadsRequest.current) return;
    writeUnfinishedUploads(window.sessionStorage, draftScope, {
      ...record,
      files: update.status === "uploaded"
        ? record.files.filter((file) => file.key !== key)
        : record.files.map((file) => file.key === key ? { ...file, attachmentId: update.attachmentId ?? null } : file),
    });
  }

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
    if (operationInFlight.current) return;
    operationInFlight.current = true;
    onBusyChange?.(true);
    setRestoredDraft(false);
    setFailure(null);
    setProblemError(null);
    const keepEarlierProblem = previousProblemSource?.title === data.title && previousProblemSource?.description === data.description;
    setSource(data);
    setShowSlowCue(false);
    setStage("checking");

    try {
      let result: TriageResponse = await runTriage(data, context);
      if (!result.success && result.error.code === "session_expired") {
        // A tab left hidden is the likely cause: ask Clerk for a fresh token and
        // check once more before asking the person to sign in.
        await refreshClerkToken().catch(() => undefined);
        result = await runTriage(data, context);
      }
      if (!result.success) {
        if (result.error.code === "validation" && result.error.field) {
          if (result.error.field === "editedProblemText") {
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
            window.setTimeout(() => focusRequestField(field), 0);
            return;
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
      setFailure(thrownGateFailure(navigator.onLine !== false));
      focusAfterCompose.current = "submit";
      setStage("compose");
    } finally {
      operationInFlight.current = false;
      onBusyChange?.(false);
    }
  }

  async function discardFailedAttachment(
    attachment: QueuedAttachment,
    requestId: string,
  ): Promise<"discarded" | "uploaded" | "failed"> {
    if (!attachment.attachmentId) return "discarded";

    try {
      const result = await discardAttachmentUpload(
        { requestId, attachmentId: attachment.attachmentId },
        context,
      );
      if (!result.success) {
        updateAttachment(attachment.key, {
          status: "failed",
          error: result.error.message,
        });
        return "failed";
      }
      reservations.current.delete(attachment.key);
      if (result.alreadyUploaded) {
        updateAttachment(attachment.key, {
          status: "uploaded",
          progress: 100,
          error: null,
        });
        return "uploaded";
      }
      updateAttachment(attachment.key, { attachmentId: null, error: null });
      return "discarded";
    } catch {
      // Keep the reservation ID until the server confirms cleanup. Retrying
      // must not reserve another slot or hide a file that still needs attention.
      updateAttachment(attachment.key, {
        status: "failed",
        error:
          "Lane could not clear this upload. Your Request is saved. Try again.",
      });
      return "failed";
    }
  }

  async function uploadAttachment(
    attachment: QueuedAttachment,
    requestId: string,
  ): Promise<boolean> {
    updateAttachment(attachment.key, {
      status: "uploading",
      progress: 0,
      error: null,
    });

    let attachmentId: string | null = null;
    try {
      const prepared = await prepareAttachmentUpload(
        {
          requestId,
          fileName: attachment.file.name,
          mimeType: attachment.file.type,
          sizeBytes: attachment.file.size,
        },
        context,
      );
      if (!prepared.success) {
        updateAttachment(attachment.key, {
          status: "failed",
          error: prepared.error.message,
        });
        return false;
      }

      attachmentId = prepared.attachmentId;
      reservations.current.set(attachment.key, attachmentId);
      updateAttachment(attachment.key, { attachmentId });
      const uploadFile =
        attachment.file.type === prepared.mimeType
          ? attachment.file
          : new File([attachment.file], attachment.file.name, {
              type: prepared.mimeType,
              lastModified: attachment.file.lastModified,
            });

      await uploadToSignedUrl(prepared.signedUrl, uploadFile, (progress) =>
        updateAttachment(attachment.key, { progress }),
      );

      const finalized = await finalizeAttachmentUpload(
        { requestId, attachmentId },
        context,
      );
      if (!finalized.success) {
        updateAttachment(attachment.key, {
          status: "failed",
          error: finalized.error.message,
        });
        return false;
      }

      reservations.current.delete(attachment.key);
      updateAttachment(attachment.key, {
        status: "uploaded",
        progress: 100,
        error: null,
      });
      return true;
    } catch {
      if (attachmentId) {
        const cleanup = await discardFailedAttachment(
          { ...attachment, attachmentId },
          requestId,
        );
        if (cleanup === "uploaded") return true;
        if (cleanup === "failed") return false;
      }
      updateAttachment(attachment.key, {
        status: "failed",
        attachmentId: null,
        error:
          "The file did not finish uploading. Your Request was created. Retry the upload.",
      });
      return false;
    }
  }

  /** The saved row joins the list's Open group through the overlay at once,
   * before any upload (plan item 2.3). No router refresh: the
   * save already revalidated the list. */
  function showCreatedInList(created: OverviewRequest | undefined) {
    if (!created) return;
    const row = { ...created, projectName: projects.projects.find((project) => project.id === created.projectId)?.name ?? created.projectName };
    createdRow.current = row;
    pendingWriter?.insert(row);
  }

  function finishCreatedRequest(requestId: string, { open = false }: { open?: boolean } = {}) {
    if (leftUploadScreen.current) return;
    uploadsRequest.current = null;
    clearUnfinishedUploads(window.sessionStorage, draftScope);
    setStage("complete");
    if (onCreated) {
      onBusyChange?.(false);
      onCreated(requestId, { open, created: createdRow.current?.id === requestId ? createdRow.current : undefined });
      return;
    }
    if (!open) toast(requestCreatedToast({}));
    router.push(`/requests/${requestId}`);
  }

  /** Nobody sees the upload screen any more: Leave page was chosen, or the composer unmounted. */
  function uploadsUnattended() {
    return leftUploadScreen.current || unmounted.current;
  }

  /** Plan item 2.3 (S3): a created Request's files that nobody attends end in
   * this document. Once no upload loop runs, open reservations are cleared and
   * so is the record: no reload happened, so no later reload may report them. */
  function settleLeftUploads() {
    const requestId = uploadsRequest.current;
    if (!uploadsUnattended() || operationInFlight.current || !requestId) return;
    uploadsRequest.current = null;
    const open = [...reservations.current.values()];
    reservations.current.clear();
    void Promise.allSettled(open.map((attachmentId) => discardAttachmentUpload({ requestId, attachmentId }, context))).then(() => {
      if (readUnfinishedUploads(window.sessionStorage, draftScope)?.requestId === requestId) clearUnfinishedUploads(window.sessionStorage, draftScope);
    });
  }

  /** Leave page in the navigation guard, whose copy says files not yet uploaded
   * won't be added. A running loop finishes its file in flight and starts no other. */
  function leaveUploadScreen() {
    leftUploadScreen.current = true;
    settleLeftUploads();
  }

  /** The composer's host unmounting (the layout leaves, or a workspace switch
   * re-keys it) cancels nothing: the upload loops go on in the background,
   * render nothing, and settle when they end. */
  function leaveOnUnmount() {
    unmounted.current = true;
    settleLeftUploads();
  }

  const onUnmount = useEffectEvent(() => {
    lostCheck.current += 1;
    leaveOnUnmount();
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

  async function onConfirm() {
    if (operationInFlight.current || !source || !triage || !token) return;

    if (triage.classification !== "problem") {
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
        token,
        editedProblemText:
          triage.classification === "problem" ? null : editedProblem,
      };
      // Saving is idempotent by the review's requestId, so an ended session
      // gets one silent retry with a fresh Clerk token, as the gate does.
      const result: SaveResponse = await saveRequest(payload, context).then(async (first) => {
        if (first.success || first.error.code !== "session_expired") return first;
        await refreshClerkToken().catch(() => undefined);
        return saveRequest(payload, context);
      });

      if (!result.success) {
        if (result.error.code === "validation" && (result.error.field === "projectId" || result.error.field === "requestType" || result.error.field === "expectedImpact")) {
          const field = result.error.field;
          setError(field, { type: "server", message: result.error.message });
          focusAfterCompose.current = "none";
          setStage("compose");
          window.setTimeout(() => focusRequestField(field), 0);
          return;
        }
        if (
          result.error.code === "validation" &&
          result.error.field === "editedProblemText"
        ) {
          setProblemError(result.error.message);
          window.setTimeout(() => problemRef.current?.focus(), 0);
        } else {
          setFailure(result.error);
        }
        setStage("framing");
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
        if (!uploadsUnattended()) finishCreatedRequest(result.requestId);
        return;
      }

      setStage("uploading");
      uploadsRequest.current = result.requestId;
      // The upload screen's effect keeps this record, but a composer unmounted
      // during the save never renders it. Start the record before any upload,
      // so a reload mid-upload still names the files.
      if (!leftUploadScreen.current) {
        writeUnfinishedUploads(window.sessionStorage, draftScope, {
          requestId: result.requestId,
          title: source.title,
          files: attachments
            .filter((attachment) => attachment.status !== "uploaded")
            .map((attachment) => ({ key: attachment.key, name: attachment.file.name, attachmentId: attachment.attachmentId })),
        });
      }
      const results: boolean[] = [];
      for (const attachment of attachments) {
        // Only Leave page stops the uploads; an unmounted composer's go on.
        if (leftUploadScreen.current) break;
        results.push(await uploadAttachment(attachment, result.requestId));
      }

      if (uploadsUnattended()) return;
      if (results.every(Boolean)) {
        finishCreatedRequest(result.requestId);
      } else {
        setStage("attachment_recovery");
      }
    } catch {
      setFailure({
        code: "save_failed",
        message:
          "Your Request could not be created. Your text is still here. Try again.",
      });
      setStage("framing");
    } finally {
      operationInFlight.current = false;
      // A composer mounted since then owns the busy flag.
      if (!unmounted.current) onBusyChange?.(false);
      settleLeftUploads();
    }
  }

  async function retryAttachments(failed: QueuedAttachment[]) {
    if (!createdRequestId || operationInFlight.current) return;
    operationInFlight.current = true;
    setMutationBusy(true);
    onBusyChange?.(true);
    const uploadedKeys = new Set<string>();

    try {
      for (const attachment of failed) {
        // Only Leave page stops the retries; an unmounted composer's go on.
        if (leftUploadScreen.current) break;
        const cleanup = await discardFailedAttachment(
          attachment,
          createdRequestId,
        );
        if (cleanup === "failed") continue;
        if (cleanup === "uploaded") {
          uploadedKeys.add(attachment.key);
          continue;
        }
        if (await uploadAttachment(attachment, createdRequestId)) {
          uploadedKeys.add(attachment.key);
        }
      }
    } finally {
      operationInFlight.current = false;
      if (!unmounted.current) {
        setMutationBusy(false);
        onBusyChange?.(false);
      }
      settleLeftUploads();
    }

    if (uploadsUnattended()) return;
    // A per-file retry must not abandon another failed file. Use the retry
    // outcomes as well as the render snapshot; React state updates may lag.
    if (
      attachments.every(
        (attachment) =>
          attachment.status === "uploaded" || uploadedKeys.has(attachment.key),
      )
    ) {
      finishCreatedRequest(createdRequestId);
    }
  }

  async function retryFailedFiles() {
    await retryAttachments(
      attachments.filter((attachment) => attachment.status === "failed"),
    );
  }

  async function removeFailedFile(attachment: QueuedAttachment) {
    if (!createdRequestId || operationInFlight.current) return;
    operationInFlight.current = true;
    setMutationBusy(true);
    onBusyChange?.(true);
    try {
      if (
        (await discardFailedAttachment(attachment, createdRequestId)) !==
          "discarded" ||
        unmounted.current
      )
        return;
      setAttachments((current) =>
        current.filter((item) => item.key !== attachment.key),
      );
    } finally {
      operationInFlight.current = false;
      if (!unmounted.current) {
        setMutationBusy(false);
        onBusyChange?.(false);
      }
      settleLeftUploads();
    }
  }

  async function continueWithoutFailedFiles() {
    if (!createdRequestId || operationInFlight.current) return;
    operationInFlight.current = true;
    setMutationBusy(true);
    onBusyChange?.(true);

    try {
      const unfinished = attachments.filter(
        (attachment) =>
          attachment.status !== "uploaded" && attachment.attachmentId,
      );
      const discarded = await Promise.all(
        unfinished.map((attachment) =>
          discardFailedAttachment(attachment, createdRequestId),
        ),
      );
      if (!uploadsUnattended() && discarded.every((result) => result !== "failed"))
        finishCreatedRequest(createdRequestId);
    } finally {
      operationInFlight.current = false;
      if (!unmounted.current) {
        setMutationBusy(false);
        onBusyChange?.(false);
      }
      settleLeftUploads();
    }
  }

  function preserveDraftForSignIn() {
    const review =
      (stage === "framing" || stage === "creating") && triage && token
        ? { triage, token, editedProblem }
        : null;

    writeIntakeDraft(window.sessionStorage, draftScope, {
      source: review && source ? source : getValues(),
      review,
      previousProblem: editedProblem || previousProblem,
      previousProblemSource,
    });
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
  // Review waits while the guardrail editor is open: Add or Cancel settles it first.
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

  /** A failed submit opens Expected impact at once and focuses its first invalid field, or its first field. */
  function revealImpact() {
    flushSync(() => {
      setImpactInstant(true);
      setImpactOpen(true);
    });
    const panel = document.getElementById(IMPACT_PANEL_ID);
    const kind = expectedImpactDraftSchema.parse(getValues("expectedImpact"))?.kind ?? "metric";
    (panel?.querySelector<HTMLElement>('[aria-invalid="true"]') ?? firstImpactField(kind))?.focus();
  }

  function focusRequestField(field: keyof RequestInput) {
    if (field === "projectId") document.getElementById("intake-project")?.focus();
    else if (field === "requestType") document.getElementById("intake-request-type")?.focus();
    else if (field === "expectedImpact") revealImpact();
    else if (earlierDraftFields.some(({ name }) => name === field)) document.getElementById("intake-earlier-details")?.focus();
    else setFocus(field);
  }

  function submitForReview() {
    if (!active || checking || projectInFlight.current || hasGuardrailEdits(getValues("expectedImpact"))) return;
    onBusyChange?.(true);
    void handleSubmit(checkFraming, (fieldErrors) => {
      onBusyChange?.(false);
      const firstField = Object.keys(fieldErrors)[0] as keyof RequestInput | undefined;
      if (!firstField) return;
      if (firstField !== "title" && firstField !== "description") {
        if (firstField === "usefulLink") setLinkOpen(true);
        window.setTimeout(() => focusRequestField(firstField), 0);
      }
    })();
  }

  return (
    <div
      className={cn(styles.composer, styles.dialog)}
      onKeyDown={onComposerKeyDown}
    >
      {active && stage !== "complete" && (creating || hasPendingUploads) && (
        <IntakeNavigationGuard creating={creating} onLeave={leaveUploadScreen} />
      )}
      <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {active ? liveStatus : ""}
      </p>
      <div className={styles.scroll}>
        {composing && (
          <form
            id={formId}
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
              <RequestTypePicker value={currentValues.requestType ?? null} onChange={(value) => { draftEdited.current = true; setValue("requestType", value, { shouldDirty: true, shouldValidate: true }); }} disabled={checking || projectBusy} error={errors.requestType?.message} />
              <Button type="button" variant="secondary" size="sm"  aria-expanded={linkOpen} aria-controls="intake-link-section" onClick={() => setLinkOpen((open) => !open)} disabled={checking}>
                {currentValues.usefulLink ? <CheckIcon size={14} strokeWidth={1.75} aria-hidden="true" /> : <PlusIcon size={14} strokeWidth={1.75} aria-hidden="true" />}Add link
              </Button>
              <Button ref={attachFilesButtonRef} type="button" variant="ghost" size="sm" onClick={() => fileInputRef.current?.click()} disabled={checking}>
                <PaperclipIcon size={14} strokeWidth={1.75} aria-hidden="true" data-icon="inline-start" />Attach files
              </Button>
              <input ref={fileInputRef} type="file" aria-label="Choose Request files" tabIndex={-1} multiple accept={ATTACHMENT_ACCEPT} className="sr-only" disabled={checking}
                onChange={(event) => { addFiles(Array.from(event.target.files ?? [])); event.target.value = ""; }} />
            </div>
            {errors.projectId && <p id="intake-project-error" role="alert" className="text-destructive-foreground">{errors.projectId.message}</p>}
            {errors.requestType && <p id="intake-request-type-error" role="alert" className="text-destructive-foreground">{errors.requestType.message}</p>}
            <ExpectedImpactDisclosure
              value={expectedImpactDraftSchema.parse(currentValues.expectedImpact) ?? EMPTY_METRIC_IMPACT}
              onChange={(value) => { draftEdited.current = true; setValue("expectedImpact", value, { shouldDirty: true, shouldValidate: isSubmitted }); }}
              disabled={checking}
              errors={errors.expectedImpact}
              open={impactOpen}
              instant={impactInstant}
              onOpenChange={(open) => { setImpactInstant(false); setImpactOpen(open); }}
            />
            <section id="intake-link-section" hidden={!linkOpen} className="border-t pt-4" aria-label="Request link">
              <div className="data-[invalid=true]:text-destructive-foreground" data-invalid={Boolean(errors.usefulLink)}>
                <Input label="Related link" id="intake-useful-link" type="url" inputMode="url" placeholder="Paste a link to a report, recording or conversation" maxLength={USEFUL_LINK_MAX} readOnly={checking}
                  aria-invalid={Boolean(errors.usefulLink) || undefined} aria-describedby={errors.usefulLink ? "intake-useful-link-error" : undefined} {...register("usefulLink")} />
                {errors.usefulLink && <p className="text-destructive-foreground" id="intake-useful-link-error">{errors.usefulLink.message}</p>}
              </div>
            </section>
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
                Up to {MAX_ATTACHMENT_FILES} files, 10 MB each and 25 MB together. Files upload after creation. Choose them again if you reload.
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
        {checking && (
          // Plan item 2.3: the gate acknowledges within a frame with the review
          // step's shape. The compose form above stays mounted but hidden, so
          // its values, number text, disclosure state and files survive a failure.
          <div className="space-y-6">
            <div className="space-y-2">
              {/* Focus reads the status with the heading: a live region inserted
                  with its text is often not announced, and focus would win. */}
              <h2 ref={headingRef} tabIndex={-1} className="text-lg font-medium" data-composer-autofocus="" aria-describedby="intake-checking-status">Review Request</h2>
              <p id="intake-checking-status" role="status" className="text-sm text-muted-foreground">
                {showSlowCue ? "Still checking. Your draft is kept." : "Checking whether this describes a problem…"}
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
            {(source.projectId || source.requestType) && (
              <p className="text-sm text-muted-foreground">
                {[
                  source.projectId ? projects.projects.find((project) => project.id === source.projectId)?.name ?? "Selected Project" : null,
                  source.requestType ? REQUEST_TYPE_LABELS[source.requestType] : null,
                ].filter((part): part is string => part !== null).map((part, index) => <Fragment key={part}>{index > 0 && ", "}<span>{part}</span></Fragment>)}
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
                          className="size-4 shrink-0"
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
            <IntakeNotice error title="Request not created">
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
            {guardrailEditing && !checking && <p id="intake-guardrail-pending" className={styles.footerNote}>Add or cancel the guardrail to review your Request.</p>}
            {shortcut}
            <Button ref={submitRef} type="submit" form={formId} disabled={projectBusy || guardrailEditing} loading={checking} aria-keyshortcuts="Meta+Enter Control+Enter"
              aria-describedby={guardrailEditing && !checking ? "intake-guardrail-pending" : undefined}>
              Review Request
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
                ? "Creating Request…"
                : failure?.code === "review_expired"
                  ? "Review again"
                  : "Create Request"}
            </Button>
          </div>
        </footer>
      )}
    </div>
  );
}
