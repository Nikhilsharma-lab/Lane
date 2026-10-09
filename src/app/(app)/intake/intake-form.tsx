"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useEffectEvent,
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
  FileTextIcon,
  ImageIcon,
  LightbulbIcon,
  LoaderCircleIcon,
  PaperclipIcon,
  RotateCcwIcon,
  Trash2Icon,
  XIcon,
} from "lucide-react";
import { useToastStack } from "@/components/arc/toast-stack/toast-stack";

import { Button } from "@/components/arc/button/button";
import { Alert } from "@/components/arc/alert/alert";
import { Input } from "@/components/arc/input/input";
import { Progress } from "@/components/arc/progress/progress";
import { Textarea } from "@/components/arc/textarea/textarea";
import { IntakeNavigationGuard } from "@/components/requests/intake-navigation-guard";
import type { TriageResult } from "@/lib/ai/triage";
import {
  clearIntakeDraft,
  intakeDraftScope,
  readIntakeDraft,
  writeIntakeDraft,
} from "@/lib/intake-draft";
import {
  ATTACHMENT_ACCEPT,
  formatAttachmentSize,
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
import { WORKSPACE_SWITCH_EVENT } from "@/lib/workspace-switch-guard";
import { ProjectPicker, RequestTypePicker, useWorkspaceProjects } from "@/components/requests/request-property-pickers";
import { REQUEST_TYPE_LABELS } from "@/lib/request-properties";
import { EMPTY_METRIC_IMPACT, expectedImpactDraftSchema, expectedImpactSchema } from "@/lib/request-impact";
import { ExpectedImpactFields } from "@/components/requests/expected-impact-fields";
import { ExpectedImpactSummary } from "@/components/requests/expected-impact-summary";
import { RequestReviewSupportingDetails } from "@/components/requests/request-review-supporting-details";
import type { z } from "zod";
import styles from "./intake-form.module.css";

import {
  discardAttachmentUpload,
  finalizeAttachmentUpload,
  prepareAttachmentUpload,
} from "./attachment-actions";
import {
  runTriage,
  saveRequest,
  type IntakeFailure,
  type SaveResponse,
  type TriageResponse,
} from "./actions";

type Stage =
  | "compose"
  | "checking"
  | "framing"
  | "creating"
  | "uploading"
  | "attachment_recovery"
  | "complete";

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

const classificationPresentation: Record<
  TriageResult["classification"],
  {
    title: string;
    description: string;
  }
> = {
  problem: {
    title: "Review your Request",
    description:
      "Check the details before sharing this Request with your team.",
  },
  solution: {
    title: "Check the suggested problem",
    description:
      "Lane’s AI suggested a problem to solve from your description. Edit anything that doesn’t match what you know.",
  },
  hybrid: {
    title: "Check the suggested problem",
    description:
      "Lane’s AI suggested a problem to solve from your description. Your suggested change will also be saved.",
  },
};

const clientNetworkFailure: IntakeFailure = {
  code: "network",
  message:
    "The review could not finish. Your draft is still here. Check your connection and try again.",
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
  return (
    <Alert tone={error ? "danger" : attention ? "warning" : "info"} title={title ?? (error ? "Action needed" : attention ? "Draft restored" : "Request update")}>
      {children}
    </Alert>
  );
}

function AttachmentIcon({ file }: { file: File }) {
  if (file.type.startsWith("image/")) {
    return (
      <ImageIcon aria-hidden="true" className="size-4" />
    );
  }
  return (
    <FileTextIcon aria-hidden="true" className="size-4" />
  );
}

export default function IntakeForm({
  context,
  draftOwnerId,
  presentation = "page",
  active = true,
  onCreated,
  onBusyChange,
  initialProjectId = null,
}: {
  context: { orgId: string };
  draftOwnerId: string;
  presentation?: "page" | "dialog";
  active?: boolean;
  onCreated?: (requestId: string) => void;
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
  const [failure, setFailure] = useState<IntakeFailure | null>(null);
  const [fileFailure, setFileFailure] = useState<string | null>(null);
  const [showSlowCue, setShowSlowCue] = useState(false);
  const [draftReady, setDraftReady] = useState(false);
  const [restoredDraft, setRestoredDraft] = useState(false);
  const [attachments, setAttachments] = useState<QueuedAttachment[]>([]);
  const [createdRequestId, setCreatedRequestId] = useState<string | null>(null);
  const [projectBusy, setProjectBusy] = useState(false);
  const projectInFlight = useRef(false);
  const projectDefaultApplied = useRef(false);
  const draftEdited = useRef(false);
  const [mutationBusy, setMutationBusy] = useState(false);

  const operationInFlight = useRef(false);
  const leftUploadScreen = useRef(false);
  const draftCleared = useRef(false);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const problemRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
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
  const isMac = useSyncExternalStore(
    useCallback(() => () => {}, []),
    () =>
      /Mac|iPhone|iPad|iPod/.test(
        `${navigator.platform} ${navigator.userAgent}`,
      ),
    () => false,
  );
  const modKey = isMac ? "⌘" : "Ctrl";

  useEffect(() => {
    const draft = readIntakeDraft(window.sessionStorage, draftScope);
    const restoreTimer = window.setTimeout(() => {
      if (draft) {
        reset(draft.source);
        setSource(draft.source);
        setFailure(null);
        setProblemError(null);
        setRestoredDraft(true);
        setLinkOpen(Boolean(draft.source.usefulLink));
        setPreviousProblem(draft.previousProblem || draft.review?.editedProblem || "");
        // A stored review knows which text produced its framing. Older compose
        // drafts may retain wording without an origin; show it, but never
        // silently attach it to a different Request.
        setPreviousProblemSource(draft.review?.triage.classification !== "problem" && draft.review
          ? { title: draft.source.title, description: draft.source.description }
          : draft.previousProblemSource ?? null);

        if (draft.review && expectedImpactSchema.safeParse(draft.source.expectedImpact).success) {
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
    if (!draftReady || draftCleared.current) return true;
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
    if (stage === "compose") setFocus("title");
    else headingRef.current?.focus();
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

  const liveStatus =
    restoredDraft && !checking && !creating
      ? "Your unsaved Request was restored."
      : checking
        ? "Preparing your Request for review."
        : stage === "framing" && triage
          ? "Your Request is ready to review."
          : creating
            ? "Creating the Request."
            : stage === "uploading"
              ? "Uploading Request files."
              : "";

  function updateAttachment(key: string, update: Partial<QueuedAttachment>) {
    setAttachments((current) =>
      current.map((attachment) =>
        attachment.key === key ? { ...attachment, ...update } : attachment,
      ),
    );
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
      const result: TriageResponse = await runTriage(data, context);
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
      setFailure(clientNetworkFailure);
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

  function finishCreatedRequest(requestId: string) {
    if (leftUploadScreen.current) return;
    setStage("complete");
    if (onCreated) {
      onBusyChange?.(false);
      onCreated(requestId);
      return;
    }
    toast({ type: "success", title: "Request created",
      description: "Open and ready to be picked up.",
    });
    router.push(`/requests/${requestId}`);
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
      const result: SaveResponse = await saveRequest(
        {
          token,
          editedProblemText:
            triage.classification === "problem" ? null : editedProblem,
        },
        context,
      );

      if (!result.success) {
        if (result.error.code === "validation" && (result.error.field === "projectId" || result.error.field === "requestType" || result.error.field === "expectedImpact")) {
          const field = result.error.field;
          setError(field, { type: "server", message: result.error.message });
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
      draftCleared.current = true;
      clearIntakeDraft(window.sessionStorage, draftScope);

      if (attachments.length === 0) {
        finishCreatedRequest(result.requestId);
        return;
      }

      setStage("uploading");
      const results: boolean[] = [];
      for (const attachment of attachments) {
        results.push(await uploadAttachment(attachment, result.requestId));
      }

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
      onBusyChange?.(false);
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
      setMutationBusy(false);
      onBusyChange?.(false);
    }

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
        "discarded"
      )
        return;
      setAttachments((current) =>
        current.filter((item) => item.key !== attachment.key),
      );
    } finally {
      operationInFlight.current = false;
      setMutationBusy(false);
      onBusyChange?.(false);
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
      if (discarded.every((result) => result !== "failed"))
        finishCreatedRequest(createdRequestId);
    } finally {
      operationInFlight.current = false;
      setMutationBusy(false);
      onBusyChange?.(false);
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

  function onReviewKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (
      event.key === "Enter" &&
      (event.metaKey || event.ctrlKey) &&
      !creating &&
      active
    ) {
      event.preventDefault();
      if (failure?.code === "review_expired" && source) {
        void checkFraming(source);
      } else {
        void onConfirm();
      }
    }
  }

  const composing = stage === "compose" || checking;
  const reviewing = stage === "framing" || creating;
  const Surface = "div";
  const ReviewFooter = "footer";

  function onProjectBusyChange(value: boolean) {
    projectInFlight.current = value;
    setProjectBusy(value);
    onBusyChange?.(value);
  }

  function focusRequestField(field: keyof RequestInput) {
    if (field === "projectId") document.getElementById("intake-project")?.focus();
    else if (field === "requestType") document.getElementById("intake-request-type")?.focus();
    else if (field === "expectedImpact") {
      const section = document.getElementById("intake-expected-impact");
      (section?.querySelector<HTMLElement>('[aria-invalid="true"]') ?? section)?.focus();
    }
    else if (earlierDraftFields.some(({ name }) => name === field)) document.getElementById("intake-earlier-details")?.focus();
    else setFocus(field);
  }

  function submitForReview() {
    if (!active || checking || projectInFlight.current) return;
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
    <div className={presentation === "page" ? "mx-auto w-full max-w-2xl px-4 py-6 sm:px-6 sm:py-8" : "flex min-h-0 min-w-0 flex-1 flex-col"}>
      {active && stage !== "complete" && (creating || hasPendingUploads) && (
        <IntakeNavigationGuard
          creating={creating}
          onLeave={() => {
            leftUploadScreen.current = true;
          }}
        />
      )}
      <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {active ? liveStatus : ""}
      </p>
      {presentation === "dialog" && reviewing && <h2 ref={headingRef} tabIndex={-1} className="mb-5 text-lg font-medium">Review Request</h2>}
      <Surface className={presentation === "page" ? "space-y-6" : cn("min-h-0 min-w-0 flex-1", reviewing ? "flex flex-col" : "space-y-5")}>
        {presentation === "page" && composing && (
          <header className="space-y-1.5">
            <h1 className="text-xl font-medium tracking-tight">New Request</h1>
            <p className="text-sm text-muted-foreground">
              Describe your Request and the result you expect. Review it before sharing with your team.
            </p>
          </header>
        )}
        {composing && (
          <form
            noValidate
            onChangeCapture={() => { draftEdited.current = true; }}
            aria-busy={checking || projectBusy || undefined}
            onSubmit={(event) => {
              event.preventDefault();
              submitForReview();
            }}
            onKeyDown={(event) => {
              if (active && event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
                event.preventDefault();
                submitForReview();
              }
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
            <div className="data-[invalid=true]:text-destructive-foreground" data-invalid={Boolean(errors.title)}>
              <Input
                label="Request title"
                id="intake-title"
                placeholder="Request title"
                maxLength={TITLE_MAX}
                readOnly={checking}
                aria-invalid={Boolean(errors.title) || undefined}
                aria-describedby={errors.title ? "intake-title-error" : undefined}
                {...register("title")}
              />
              {errors.title && (
                <p className="text-destructive-foreground" id="intake-title-error">
                  {errors.title.message}
                </p>
              )}
            </div>
            <div className="data-[invalid=true]:text-destructive-foreground" data-invalid={Boolean(errors.description)}>
              <Textarea
                label="Description"
                id="intake-description"
                placeholder="Add a description…"
                rows={3}
                maxLength={DESCRIPTION_MAX}
                readOnly={checking}
                aria-invalid={Boolean(errors.description) || undefined}
                aria-describedby={errors.description ? "intake-description-error" : undefined}
                {...register("description")}
              />
              {errors.description && (
                <p className="text-destructive-foreground" id="intake-description-error">
                  {errors.description.message}
                </p>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2" aria-label="Request properties and supporting details">
              <ProjectPicker orgId={context.orgId} value={currentValues.projectId ?? null} onChange={(value) => { draftEdited.current = true; setValue("projectId", value, { shouldDirty: true, shouldValidate: true }); }} disabled={checking} state={projects} onBusyChange={onProjectBusyChange} error={errors.projectId?.message} />
              <RequestTypePicker value={currentValues.requestType ?? null} onChange={(value) => { draftEdited.current = true; setValue("requestType", value, { shouldDirty: true, shouldValidate: true }); }} disabled={checking || projectBusy} error={errors.requestType?.message} />
              <Button type="button" variant="secondary" size="sm"  aria-expanded={linkOpen} aria-controls="intake-link-section" onClick={() => setLinkOpen((open) => !open)} disabled={checking}>
                {currentValues.usefulLink ? <CheckIcon aria-hidden="true" /> : <PlusIcon aria-hidden="true" />}Add link
              </Button>
              <Button type="button" variant="ghost" size="sm"  onClick={() => fileInputRef.current?.click()} disabled={checking}>
                <PaperclipIcon aria-hidden="true" data-icon="inline-start" />Attach files
              </Button>
              <input ref={fileInputRef} type="file" aria-label="Choose Request files" tabIndex={-1} multiple accept={ATTACHMENT_ACCEPT} className="sr-only" disabled={checking}
                onChange={(event) => { addFiles(Array.from(event.target.files ?? [])); event.target.value = ""; }} />
            </div>
            {errors.projectId && <p id="intake-project-error" role="alert" className="text-destructive-foreground">{errors.projectId.message}</p>}
            {errors.requestType && <p id="intake-request-type-error" role="alert" className="text-destructive-foreground">{errors.requestType.message}</p>}
            <ExpectedImpactFields
              value={expectedImpactDraftSchema.parse(currentValues.expectedImpact) ?? EMPTY_METRIC_IMPACT}
              onChange={(value) => { draftEdited.current = true; setValue("expectedImpact", value, { shouldDirty: true, shouldValidate: isSubmitted }); }}
              disabled={checking}
              errors={errors.expectedImpact}
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
            {attachments.length > 0 && (
              <div className="space-y-2">
                <ul aria-label="Files ready to upload" className="divide-y">
                  {attachments.map((attachment) => (
                    <li key={attachment.key} className="flex items-center gap-3 py-2">
                      <span className="shrink-0 text-muted-foreground"><AttachmentIcon file={attachment.file} /></span>
                      <span className="min-w-0 flex-1 truncate text-sm">{attachment.file.name}</span>
                      <span className="shrink-0 text-xs text-muted-foreground">{formatAttachmentSize(attachment.file.size)}</span>
                      <Button type="button" size="sm" variant="ghost" aria-label={`Remove ${attachment.file.name}`} onClick={() => removeQueuedFile(attachment.key)} disabled={checking}>
                        <XIcon aria-hidden="true" />
                      </Button>
                    </li>
                  ))}
                </ul>
                <p className="text-xs text-muted-foreground">
                  Up to {MAX_ATTACHMENT_FILES} files, 10 MB each and 25 MB together. Files upload after creation. Choose them again if you reload.
                </p>
              </div>
            )}
            {failure && (
              <IntakeNotice error title="Could not prepare the review">
                <span>{failure.message}</span>
                {failure.code === "session_expired" && (
                  <> <Link href="/login#/?redirect_url=%2Fintake" onClick={preserveDraftForSignIn} className="font-medium text-foreground underline underline-offset-4">Sign in again</Link></>
                )}
              </IntakeNotice>
            )}
            <footer className="flex justify-end border-t pt-4">
              <Button type="submit" disabled={checking || projectBusy}>
                {checking && <LoaderCircleIcon aria-hidden="true" data-icon="inline-start" className="animate-spin motion-reduce:animate-none" />}
                {checking ? "Preparing review…" : "Review Request"}
              </Button>
            </footer>
            {checking && showSlowCue && (
              <p className="text-sm text-muted-foreground">Still preparing your review. Your draft is still here.</p>
            )}
          </form>
        )}
      {(stage === "framing" || stage === "creating") && triage && source && (
        <div
          className={cn(reveal, presentation === "dialog" ? "flex min-h-0 flex-1 flex-col" : "space-y-6")}
          aria-busy={creating || undefined}
          onKeyDown={onReviewKeyDown}
        >
          <div className={cn("space-y-6", presentation === "dialog" && "min-h-0 flex-1")}>
          {(presentation === "page" || triage.classification !== "problem" || restoredDraft) && <header className="space-y-3">
            <div className="space-y-2">
              {presentation === "page" && <h2
                ref={headingRef}
                tabIndex={-1}
                className={cn(
                  "text-xl font-medium tracking-tight",
                  "focus:outline-none",
                )}
              >
                {classificationPresentation[triage.classification].title}
              </h2>}
              {(presentation === "page" || triage.classification !== "problem") && <p
                className={cn(
                  "text-sm leading-relaxed",
                  "max-w-[62ch] text-pretty text-muted-foreground",
                )}
              >
                {classificationPresentation[triage.classification].description}
              </p>}
              {restoredDraft && (
                <IntakeNotice attention>
                  Your review was restored. Text and links are still here.
                  Choose any files again before creating the Request.
                </IntakeNotice>
              )}
            </div>
          </header>}

          <h3 className="break-words text-lg font-medium">{source.title}</h3>

          {(source.projectId || source.requestType) && <dl className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
            {source.projectId && <div><dt className="text-xs text-muted-foreground">Project</dt><dd>{projects.projects.find((project) => project.id === source.projectId)?.name ?? "Selected Project"}</dd></div>}
            {source.requestType && <div><dt className="text-xs text-muted-foreground">Request type</dt><dd>{REQUEST_TYPE_LABELS[source.requestType]}</dd></div>}
          </dl>}

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
          <ReviewFooter className={cn("flex shrink-0 flex-wrap items-center justify-end gap-2 border-t pt-4", presentation === "dialog" && styles.reviewFooter)}>
            <Button type="button" variant="ghost" onClick={() => {
              setFailure(null);
              setStage("compose");
            }} disabled={creating}>Edit Request</Button>
            <Button
              type="button"
              onClick={
                failure?.code === "review_expired"
                  ? () => source && void checkFraming(source)
                  : () => void onConfirm()
              }
              disabled={creating}
              aria-busy={creating || undefined}
              aria-keyshortcuts="Control+Enter Meta+Enter"
            >
              {creating && (
                <LoaderCircleIcon
                  aria-hidden="true"
                  data-icon="inline-start"
                  className="animate-spin motion-reduce:animate-none"
                />
              )}
              {creating
                ? "Creating Request…"
                : failure?.code === "review_expired"
                  ? "Review again"
                  : "Create Request"}
            </Button>
          </ReviewFooter>

          {!creating && (
            <p
              className={cn(
                "text-xs",
                "sr-only",
              )}
            >
              Press{" "}
              <kbd className="rounded border border-input bg-muted px-1.5 py-0.5 font-mono">
                {modKey}
              </kbd>{" "}
              +{" "}
              <kbd className="rounded border border-input bg-muted px-1.5 py-0.5 font-mono">
                Enter
              </kbd>{" "}
              to create.
            </p>
          )}
        </div>
      )}

      {(stage === "uploading" || stage === "attachment_recovery") &&
        createdRequestId && (
          <div className={cn(reveal, "mx-auto max-w-[680px] space-y-6")}>
            <header className="space-y-2">
              <p
                className={cn(
                  "text-xs font-medium",
                  "font-medium text-muted-foreground",
                )}
              >
                Request created
              </p>
              <h2
                ref={headingRef}
                tabIndex={-1}
                className={cn(
                  "text-xl font-medium tracking-tight",
                  "focus:outline-none",
                )}
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

            <ul aria-label="Request file uploads" className="space-y-3">
              {attachments.map((attachment) => (
                <li
                  key={attachment.key}
                  className="flex items-start gap-3 border-b py-3 last:border-0"
                >
                  <span className="flex size-8 shrink-0 items-center justify-center text-muted-foreground">
                    <AttachmentIcon file={attachment.file} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className={cn("text-sm font-medium", "truncate")}>
                      {attachment.file.name}
                    </p>
                    <div className="mt-1 flex items-center justify-between gap-3">
                      <p
                        className={cn(
                          "text-xs",
                          cn(
                            "text-muted-foreground",
                            attachment.status === "failed" &&
                              "text-destructive-foreground",
                            attachment.status === "uploaded" &&
                              "text-success-foreground",
                          ),
                        )}
                      >
                        {attachment.status === "queued"
                          ? "Waiting"
                          : attachment.status === "uploading"
                            ? `${attachment.progress}% uploaded`
                            : attachment.status === "uploaded"
                              ? "Uploaded"
                              : "Upload failed"}
                      </p>
                      {attachment.status === "uploaded" && (
                        <CheckIcon
                          aria-hidden="true"
                          className="size-4 shrink-0 text-success-foreground"
                        />
                      )}
                    </div>
                    {attachment.status === "uploading" && (
                      <Progress
                        value={attachment.progress}
                        aria-label={`Uploading ${attachment.file.name}`}
                        className="mt-2"
                      />
                    )}
                    {attachment.error && (
                      <p
                        className={cn(
                          "text-xs",
                          "mt-2 text-destructive-foreground",
                        )}
                      >
                        {attachment.error}
                      </p>
                    )}
                    {stage === "attachment_recovery" &&
                      attachment.status === "failed" && (
                        <div className="mt-3 flex flex-wrap gap-2">
                          <Button
                            type="button"
                            size="sm"
                            variant="secondary"
                            onClick={() => void retryAttachments([attachment])}
                            disabled={mutationBusy}
                          >
                            <RotateCcwIcon
                              aria-hidden="true"
                              data-icon="inline-start"
                            />
                            Retry upload
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            onClick={() => void removeFailedFile(attachment)}
                            disabled={mutationBusy}
                          >
                            <Trash2Icon
                              aria-hidden="true"
                              data-icon="inline-start"
                            />
                            Remove
                          </Button>
                        </div>
                      )}
                  </div>
                </li>
              ))}
            </ul>

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
                onClick={() => finishCreatedRequest(createdRequestId)}
              >
                View Request
              </Button>
            )}
          </div>
        )}
      </Surface>
    </div>
  );
}
