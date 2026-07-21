"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  CheckIcon,
  CircleCheckIcon,
  FileTextIcon,
  GitMergeIcon,
  ImageIcon,
  InfoIcon,
  LightbulbIcon,
  LoaderCircleIcon,
  PaperclipIcon,
  RotateCcwIcon,
  SearchIcon,
  Trash2Icon,
  UploadIcon,
  UserRoundIcon,
  XIcon,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Feedback } from "@/components/ui/feedback";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import {
  Typography,
  typographyVariants,
} from "@/components/ui/typography";
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
  CONTEXT_MAX,
  DESCRIPTION_MAX,
  problemFramingSchema,
  requestSchema,
  TITLE_MAX,
  USEFUL_LINK_MAX,
  type RequestInput,
} from "@/lib/request-schema";
import { cn } from "@/lib/utils";

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
  | "tell"
  | "details"
  | "review"
  | "checking"
  | "framing"
  | "creating"
  | "uploading"
  | "attachment_recovery";

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
};

const classificationPresentation: Record<
  TriageResult["classification"],
  {
    label: string;
    title: string;
    description: string;
    icon: LucideIcon;
    tag: string;
  }
> = {
  problem: {
    label: "Problem-framed",
    title: "The problem is clear",
    description:
      "This describes the need without prescribing the answer.",
    icon: CircleCheckIcon,
    tag: "border-success-border bg-success-soft text-success",
  },
  solution: {
    label: "Solution-shaped",
    title: "Let’s make the problem clear",
    description:
      "Lane found a proposed answer. Confirm the need your team should solve.",
    icon: LightbulbIcon,
    tag: "border-warning-border bg-warning-soft text-warning",
  },
  hybrid: {
    label: "Problem + idea",
    title: "Separate the problem from the idea",
    description:
      "Keep the need as the Request and preserve the proposed solution as context.",
    icon: GitMergeIcon,
    tag: "border-brand bg-brand-soft text-brand",
  },
};

const clientNetworkFailure: IntakeFailure = {
  code: "network",
  message:
    "Lane could not complete that request. Check your connection—your work is still here—then try again.",
};

function uploadToSignedUrl(
  signedUrl: string,
  file: File,
  onProgress: (progress: number) => void
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

function ClassificationTag({
  classification,
}: {
  classification: TriageResult["classification"];
}) {
  const presentation = classificationPresentation[classification];
  const Icon = presentation.icon;

  return (
    <div
      className={cn(
        "inline-flex w-fit items-center gap-2 rounded-md border px-2.5 py-1.5 text-type-label",
        presentation.tag
      )}
    >
      <Icon aria-hidden="true" className="size-4 shrink-0" strokeWidth={1.8} />
      <span>{presentation.label}</span>
    </div>
  );
}

function IntakeStepper({ step }: { step: 1 | 2 | 3 }) {
  const steps = [
    { number: 1 as const, label: "Tell us" },
    { number: 2 as const, label: "Add details" },
    { number: 3 as const, label: "Review" },
  ];

  return (
    <ol aria-label="Request progress" className="flex w-full items-center gap-2">
      {steps.map((item, index) => {
        const active = item.number === step;
        const complete = item.number < step;
        return (
          <li
            key={item.number}
            aria-current={active ? "step" : undefined}
            className={cn(
              "flex min-w-0 items-center gap-2",
              index < steps.length - 1 && "flex-1"
            )}
          >
            <span
              className={cn(
                "flex size-6 shrink-0 items-center justify-center rounded-full border text-type-micro font-semibold",
                active &&
                  "border-primary bg-primary text-primary-foreground",
                complete &&
                  "border-muted bg-muted text-foreground",
                !active &&
                  !complete &&
                  "border-input bg-card text-muted-foreground"
              )}
            >
              {complete ? (
                <CheckIcon aria-hidden="true" className="size-3.5" strokeWidth={2} />
              ) : (
                item.number
              )}
            </span>
            <span
              className={cn(
                "hidden text-type-meta sm:inline",
                active ? "font-semibold text-foreground" : "text-muted-foreground"
              )}
            >
              {item.label}
            </span>
            {index < steps.length - 1 && (
              <span aria-hidden="true" className="h-px flex-1 bg-border" />
            )}
          </li>
        );
      })}
    </ol>
  );
}

function WizardHeader({
  step,
  title,
  description,
  headingRef,
}: {
  step: 1 | 2 | 3;
  title: string;
  description: string;
  headingRef: React.RefObject<HTMLHeadingElement | null>;
}) {
  return (
    <header className="space-y-4">
      <IntakeStepper step={step} />
      <div className="space-y-1.5">
        <Typography
          as="p"
          role="micro"
          className="font-semibold tracking-[0.08em] text-brand uppercase"
        >
          Step {step} of 3
        </Typography>
        <h1
          ref={headingRef}
          tabIndex={-1}
          className={cn(
            typographyVariants({ role: "pageTitle" }),
            "focus:outline-none"
          )}
        >
          {title}
        </h1>
        <Typography
          as="p"
          role="ui"
          className="max-w-[62ch] text-pretty text-muted-foreground"
        >
          {description}
        </Typography>
      </div>
    </header>
  );
}

function RequestSummary({
  values,
  files,
  step,
}: {
  values: RequestInput;
  files: QueuedAttachment[];
  step: 1 | 2 | 3;
}) {
  const optionalCount = [
    values.affectedPeople,
    values.desiredChange,
    values.observedEvidence,
    values.uncertainty,
    values.usefulLink,
    files.length > 0 ? "files" : "",
  ].filter((value) => value.trim().length > 0).length;

  return (
    <aside className="rounded-xl border bg-card p-5 lg:sticky lg:top-6">
      <Typography
        as="p"
        role="micro"
        className="font-semibold tracking-[0.08em] text-brand uppercase"
      >
        Your Request
      </Typography>
      <Typography as="h2" role="sectionTitle" className="mt-2">
        {step === 1
          ? "Start with what you know."
          : optionalCount > 0
            ? "You have added useful detail."
            : "The required story is ready."}
      </Typography>
      <Typography
        as="p"
        role="support"
        className="mt-1 text-muted-foreground"
      >
        Only the title and what happened are required.
      </Typography>

      <dl className="mt-5 divide-y border-y">
        <div className="flex min-h-12 items-center gap-3 py-2.5">
          <span className="flex size-5 shrink-0 items-center justify-center text-muted-foreground">
            {values.title.trim() && values.description.trim() ? (
              <CheckIcon aria-hidden="true" className="size-4 text-brand" />
            ) : (
              <span className="size-3.5 rounded-full border border-input" />
            )}
          </span>
          <Typography as="dt" role="label" className="min-w-0 flex-1">
            Title and description
          </Typography>
          <Typography as="dd" role="meta" className="text-muted-foreground">
            Required
          </Typography>
        </div>
        <div className="flex min-h-12 items-center gap-3 py-2.5">
          <span className="flex size-5 shrink-0 items-center justify-center">
            <UserRoundIcon
              aria-hidden="true"
              className="size-4 text-muted-foreground"
              strokeWidth={1.8}
            />
          </span>
          <Typography as="dt" role="label" className="min-w-0 flex-1">
            Who is affected
          </Typography>
          <Typography as="dd" role="meta" className="text-muted-foreground">
            {values.affectedPeople || values.desiredChange ? "Added" : "Optional"}
          </Typography>
        </div>
        <div className="flex min-h-12 items-center gap-3 py-2.5">
          <span className="flex size-5 shrink-0 items-center justify-center">
            <SearchIcon
              aria-hidden="true"
              className="size-4 text-muted-foreground"
              strokeWidth={1.8}
            />
          </span>
          <Typography as="dt" role="label" className="min-w-0 flex-1">
            What you have seen
          </Typography>
          <Typography as="dd" role="meta" className="text-muted-foreground">
            {values.observedEvidence || values.uncertainty
              ? "Added"
              : "Optional"}
          </Typography>
        </div>
        <div className="flex min-h-12 items-center gap-3 py-2.5">
          <span className="flex size-5 shrink-0 items-center justify-center">
            <PaperclipIcon
              aria-hidden="true"
              className="size-4 text-muted-foreground"
              strokeWidth={1.8}
            />
          </span>
          <Typography as="dt" role="label" className="min-w-0 flex-1">
            Files and links
          </Typography>
          <Typography as="dd" role="meta" className="text-muted-foreground">
            {files.length > 0
              ? `${files.length} file${files.length === 1 ? "" : "s"}`
              : values.usefulLink
                ? "Link added"
                : "Optional"}
          </Typography>
        </div>
      </dl>

      <div className="mt-4 flex items-start gap-2.5 rounded-lg bg-muted p-3">
        <InfoIcon
          aria-hidden="true"
          className="mt-0.5 size-4 shrink-0 text-muted-foreground"
          strokeWidth={1.8}
        />
        <Typography as="p" role="meta" className="text-muted-foreground">
          {step === 3
            ? "Next, Lane checks whether the wording describes a problem or suggests a solution."
            : "Add only what you know. You can skip every optional detail."}
        </Typography>
      </div>
    </aside>
  );
}

function AttachmentIcon({ file }: { file: File }) {
  if (file.type.startsWith("image/")) {
    return <ImageIcon aria-hidden="true" className="size-4" strokeWidth={1.8} />;
  }
  return <FileTextIcon aria-hidden="true" className="size-4" strokeWidth={1.8} />;
}

export default function IntakeForm({
  context,
  draftOwnerId,
}: {
  context: { orgId: string };
  draftOwnerId: string;
}) {
  const router = useRouter();
  const [stage, setStage] = useState<Stage>("tell");
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

  const operationInFlight = useRef(false);
  const draftCleared = useRef(false);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const problemRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const draftScope = intakeDraftScope(draftOwnerId, context.orgId);

  const {
    control,
    register,
    handleSubmit,
    getValues,
    reset,
    setError,
    setFocus,
    trigger,
    formState: { errors },
  } = useForm<RequestInput>({
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
    }),
    [
      watched.affectedPeople,
      watched.description,
      watched.desiredChange,
      watched.observedEvidence,
      watched.title,
      watched.uncertainty,
      watched.usefulLink,
    ]
  );

  const checking = stage === "checking";
  const creating = stage === "creating";
  const isMac = useSyncExternalStore(
    useCallback(() => () => {}, []),
    () =>
      /Mac|iPhone|iPad|iPod/.test(
        `${navigator.platform} ${navigator.userAgent}`
      ),
    () => false
  );
  const modKey = isMac ? "⌘" : "Ctrl";

  useEffect(() => {
    const draft = readIntakeDraft(window.sessionStorage, draftScope);
    let focusTimer: number | undefined;
    const restoreTimer = window.setTimeout(() => {
      if (draft) {
        reset(draft.source);
        setSource(draft.source);
        setFailure(null);
        setProblemError(null);
        setRestoredDraft(true);

        if (draft.review) {
          setTriage(draft.review.triage);
          setToken(draft.review.token);
          setEditedProblem(draft.review.editedProblem);
          setStage("framing");
        } else {
          setStage("tell");
        }

        focusTimer = window.setTimeout(() => headingRef.current?.focus(), 0);
      }

      setDraftReady(true);
    }, 0);

    return () => {
      window.clearTimeout(restoreTimer);
      if (focusTimer !== undefined) window.clearTimeout(focusTimer);
    };
  }, [draftScope, reset]);

  useEffect(() => {
    if (!draftReady || draftCleared.current) return;

    const review =
      (stage === "framing" || stage === "creating") && triage && token
        ? { triage, token, editedProblem }
        : null;
    writeIntakeDraft(window.sessionStorage, draftScope, {
      source: review && source ? source : currentValues,
      review,
    });
  }, [
    currentValues,
    draftReady,
    draftScope,
    editedProblem,
    source,
    stage,
    token,
    triage,
  ]);

  useEffect(() => {
    headingRef.current?.focus();
  }, [stage]);

  useEffect(() => {
    if (!checking) return;
    const timer = window.setTimeout(() => setShowSlowCue(true), 5_000);
    return () => window.clearTimeout(timer);
  }, [checking]);

  const liveStatus =
    restoredDraft && !checking && !creating
      ? "Your unsaved Request was restored after signing in."
      : checking
        ? "Checking the Request framing."
        : stage === "framing" && triage
          ? `${classificationPresentation[triage.classification].label} result ready to review.`
          : creating
            ? "Creating the Request."
            : stage === "uploading"
              ? "Uploading Request files."
              : "";

  function updateAttachment(
    key: string,
    update: Partial<QueuedAttachment>
  ) {
    setAttachments((current) =>
      current.map((attachment) =>
        attachment.key === key ? { ...attachment, ...update } : attachment
      )
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
      current.filter((attachment) => attachment.key !== key)
    );
    setFileFailure(null);
  }

  async function goToDetails() {
    const valid = await trigger(["title", "description"], {
      shouldFocus: true,
    });
    if (!valid) return;
    setFailure(null);
    setStage("details");
  }

  async function goToReview() {
    const valid = await trigger(undefined, { shouldFocus: true });
    if (!valid) return;
    setFailure(null);
    setStage("review");
  }

  async function checkFraming(data: RequestInput) {
    if (operationInFlight.current) return;
    operationInFlight.current = true;
    setRestoredDraft(false);
    setFailure(null);
    setProblemError(null);
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
            if (
              result.error.field === "title" ||
              result.error.field === "description"
            ) {
              setStage("tell");
            } else {
              setStage("details");
            }
            setFocus(result.error.field);
            return;
          }
        } else {
          setFailure(result.error);
        }
        setStage("review");
        return;
      }

      setTriage(result.triage);
      setToken(result.token);
      setEditedProblem(result.triage.reframedProblem ?? "");
      setStage("framing");
    } catch {
      setFailure(clientNetworkFailure);
      setStage("review");
    } finally {
      operationInFlight.current = false;
    }
  }

  async function uploadAttachment(
    attachment: QueuedAttachment,
    requestId: string
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
        context
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
        updateAttachment(attachment.key, { progress })
      );

      const finalized = await finalizeAttachmentUpload(
        { requestId, attachmentId },
        context
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
        await discardAttachmentUpload(
          { requestId, attachmentId },
          context
        );
      }
      updateAttachment(attachment.key, {
        status: "failed",
        attachmentId: null,
        error:
          "The file did not finish uploading. The Request is safe. Try again.",
      });
      return false;
    }
  }

  function finishCreatedRequest(requestId: string) {
    toast.success("Request created", {
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
        context
      );

      if (!result.success) {
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
          "Lane could not create this Request. Your confirmed framing is still here. Try again.",
      });
      setStage("framing");
    } finally {
      operationInFlight.current = false;
    }
  }

  async function retryAttachments(failed: QueuedAttachment[]) {
    if (!createdRequestId || operationInFlight.current) return;
    operationInFlight.current = true;
    const results: boolean[] = [];

    try {
      for (const attachment of failed) {
        if (attachment.attachmentId) {
          await discardAttachmentUpload(
            {
              requestId: createdRequestId,
              attachmentId: attachment.attachmentId,
            },
            context
          );
          updateAttachment(attachment.key, { attachmentId: null });
        }
        results.push(await uploadAttachment(attachment, createdRequestId));
      }
    } finally {
      operationInFlight.current = false;
    }

    if (results.every(Boolean)) finishCreatedRequest(createdRequestId);
  }

  async function retryFailedFiles() {
    await retryAttachments(
      attachments.filter((attachment) => attachment.status === "failed")
    );
  }

  async function removeFailedFile(attachment: QueuedAttachment) {
    if (createdRequestId && attachment.attachmentId) {
      await discardAttachmentUpload(
        {
          requestId: createdRequestId,
          attachmentId: attachment.attachmentId,
        },
        context
      );
    }
    setAttachments((current) =>
      current.filter((item) => item.key !== attachment.key)
    );
  }

  async function continueWithoutFailedFiles() {
    if (!createdRequestId || operationInFlight.current) return;
    operationInFlight.current = true;

    try {
      const unfinished = attachments.filter(
        (attachment) =>
          attachment.status !== "uploaded" && attachment.attachmentId
      );
      await Promise.all(
        unfinished.map((attachment) =>
          discardAttachmentUpload(
            {
              requestId: createdRequestId,
              attachmentId: attachment.attachmentId!,
            },
            context
          )
        )
      );
      finishCreatedRequest(createdRequestId);
    } finally {
      operationInFlight.current = false;
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
    });
  }

  function onReviewKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (
      event.key === "Enter" &&
      (event.metaKey || event.ctrlKey) &&
      !creating
    ) {
      event.preventDefault();
      if (failure?.code === "review_expired" && source) {
        void checkFraming(source);
      } else {
        void onConfirm();
      }
    }
  }

  const wizardStep: 1 | 2 | 3 =
    stage === "tell" ? 1 : stage === "details" ? 2 : 3;
  const wizard =
    stage === "tell" ||
    stage === "details" ||
    stage === "review" ||
    stage === "checking";

  return (
    <main
      className={cn(
        "mx-auto w-full px-4 py-6 sm:px-6 sm:py-8",
        wizard ? "max-w-[1088px]" : "max-w-[920px]"
      )}
    >
      <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {liveStatus}
      </p>

      {wizard && (
        <div className={cn(reveal, "space-y-6")}>
          <WizardHeader
            step={wizardStep}
            headingRef={headingRef}
            title={
              stage === "tell"
                ? "Tell us what’s happening."
                : stage === "details"
                  ? "Add any details that will help."
                  : "Check your Request."
            }
            description={
              stage === "tell"
                ? "Write it in your own words. You can add more detail next."
                : stage === "details"
                  ? "Everything here is optional. Add only what you already know."
                  : "If anything looks wrong, go back and edit it before Lane checks the wording."
            }
          />

          {restoredDraft && (
            <Feedback kind="success" variant="inline">
              Your unsaved Request is back. Text and links were restored.
              Files stay only in the tab where you choose them.
            </Feedback>
          )}

          <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,660px)_minmax(280px,1fr)]">
            <form
              noValidate
              onSubmit={(event) => {
                event.preventDefault();
                if (stage === "tell") void goToDetails();
                else if (stage === "details") void goToReview();
                else void handleSubmit(checkFraming)();
              }}
              className="min-w-0 space-y-4"
              aria-busy={checking || undefined}
            >
              {stage === "tell" && (
                <section className="space-y-5 rounded-xl border bg-card p-5">
                  <Field invalid={Boolean(errors.title)}>
                    <FieldLabel htmlFor="intake-title">Short title *</FieldLabel>
                    <Input
                      id="intake-title"
                      placeholder="For example: Customers can’t find their saved drafts"
                      maxLength={TITLE_MAX}
                      aria-invalid={Boolean(errors.title) || undefined}
                      aria-describedby={
                        errors.title ? "intake-title-error" : undefined
                      }
                      {...register("title")}
                    />
                    {errors.title && (
                      <FieldError id="intake-title-error">
                        {errors.title.message}
                      </FieldError>
                    )}
                  </Field>

                  <Field invalid={Boolean(errors.description)}>
                    <FieldLabel htmlFor="intake-description">
                      What happened? *
                    </FieldLabel>
                    <Textarea
                      id="intake-description"
                      placeholder="What did you notice? Who ran into it? What made it a problem?"
                      rows={6}
                      maxLength={DESCRIPTION_MAX}
                      className="min-h-32 resize-y"
                      aria-invalid={Boolean(errors.description) || undefined}
                      aria-describedby={
                        errors.description
                          ? "intake-description-error"
                          : "intake-description-help"
                      }
                      {...register("description")}
                    />
                    {errors.description ? (
                      <FieldError id="intake-description-error">
                        {errors.description.message}
                      </FieldError>
                    ) : (
                      <FieldDescription id="intake-description-help">
                        Just tell us what you know. Lane will help make it
                        clearer.
                      </FieldDescription>
                    )}
                  </Field>
                </section>
              )}

              {stage === "details" && (
                <>
                  <section className="space-y-5 rounded-xl border bg-card p-5">
                    <div className="flex items-center gap-2">
                      <UserRoundIcon
                        aria-hidden="true"
                        className="size-4 text-brand"
                        strokeWidth={1.8}
                      />
                      <Typography as="h2" role="sectionTitle">
                        Who is affected?
                      </Typography>
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <Field invalid={Boolean(errors.affectedPeople)}>
                        <FieldLabel htmlFor="intake-affected">
                          Who ran into this?
                        </FieldLabel>
                        <Textarea
                          id="intake-affected"
                          rows={3}
                          maxLength={CONTEXT_MAX}
                          placeholder="Customers, teammates, or a specific group"
                          className="min-h-24 resize-y"
                          aria-invalid={
                            Boolean(errors.affectedPeople) || undefined
                          }
                          {...register("affectedPeople")}
                        />
                        {errors.affectedPeople && (
                          <FieldError>
                            {errors.affectedPeople.message}
                          </FieldError>
                        )}
                      </Field>
                      <Field invalid={Boolean(errors.desiredChange)}>
                        <FieldLabel htmlFor="intake-desired-change">
                          What would be better?
                        </FieldLabel>
                        <Textarea
                          id="intake-desired-change"
                          rows={3}
                          maxLength={CONTEXT_MAX}
                          placeholder="Describe the change people need, not the feature"
                          className="min-h-24 resize-y"
                          aria-invalid={
                            Boolean(errors.desiredChange) || undefined
                          }
                          {...register("desiredChange")}
                        />
                        {errors.desiredChange && (
                          <FieldError>
                            {errors.desiredChange.message}
                          </FieldError>
                        )}
                      </Field>
                    </div>
                  </section>

                  <section className="space-y-5 rounded-xl border bg-card p-5">
                    <div className="flex items-center gap-2">
                      <SearchIcon
                        aria-hidden="true"
                        className="size-4 text-brand"
                        strokeWidth={1.8}
                      />
                      <Typography as="h2" role="sectionTitle">
                        What have you seen?
                      </Typography>
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <Field invalid={Boolean(errors.observedEvidence)}>
                        <FieldLabel
                          htmlFor="intake-evidence"
                          className="text-brand"
                        >
                          What we know · observed
                        </FieldLabel>
                        <Textarea
                          id="intake-evidence"
                          rows={4}
                          maxLength={CONTEXT_MAX}
                          placeholder="Examples, research, quotes, or a repeated pattern"
                          className="min-h-28 resize-y"
                          aria-invalid={
                            Boolean(errors.observedEvidence) || undefined
                          }
                          {...register("observedEvidence")}
                        />
                        {errors.observedEvidence && (
                          <FieldError>
                            {errors.observedEvidence.message}
                          </FieldError>
                        )}
                      </Field>
                      <Field invalid={Boolean(errors.uncertainty)}>
                        <FieldLabel htmlFor="intake-uncertainty">
                          What we’re not sure about · unconfirmed
                        </FieldLabel>
                        <Textarea
                          id="intake-uncertainty"
                          rows={4}
                          maxLength={CONTEXT_MAX}
                          placeholder="A belief, assumption, or question still to verify"
                          className="min-h-28 resize-y"
                          aria-invalid={
                            Boolean(errors.uncertainty) || undefined
                          }
                          {...register("uncertainty")}
                        />
                        {errors.uncertainty && (
                          <FieldError>
                            {errors.uncertainty.message}
                          </FieldError>
                        )}
                      </Field>
                    </div>
                  </section>

                  <section className="space-y-5 rounded-xl border bg-card p-5">
                    <div className="flex items-center gap-2">
                      <PaperclipIcon
                        aria-hidden="true"
                        className="size-4 text-brand"
                        strokeWidth={1.8}
                      />
                      <Typography as="h2" role="sectionTitle">
                        Files and links
                      </Typography>
                      <Typography
                        as="span"
                        role="meta"
                        className="ml-auto text-muted-foreground"
                      >
                        Optional
                      </Typography>
                    </div>

                    <Field invalid={Boolean(errors.usefulLink)}>
                      <FieldLabel htmlFor="intake-useful-link">
                        Useful link
                      </FieldLabel>
                      <Input
                        id="intake-useful-link"
                        type="url"
                        inputMode="url"
                        placeholder="https://docs.example.com/request-context"
                        maxLength={USEFUL_LINK_MAX}
                        aria-invalid={Boolean(errors.usefulLink) || undefined}
                        {...register("usefulLink")}
                      />
                      {errors.usefulLink && (
                        <FieldError>{errors.usefulLink.message}</FieldError>
                      )}
                    </Field>

                    <div
                      onDragOver={(event) => {
                        event.preventDefault();
                        event.dataTransfer.dropEffect = "copy";
                      }}
                      onDrop={(event) => {
                        event.preventDefault();
                        addFiles(Array.from(event.dataTransfer.files));
                      }}
                      className="flex min-h-28 flex-col items-center justify-center gap-1.5 rounded-lg border border-dashed border-input bg-recessed px-4 py-5 text-center transition-colors focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50"
                    >
                      <UploadIcon
                        aria-hidden="true"
                        className="size-5 text-muted-foreground"
                        strokeWidth={1.8}
                      />
                      <button
                        type="button"
                        className="rounded-sm text-type-label font-semibold outline-none"
                        onClick={() => fileInputRef.current?.click()}
                      >
                        Drop files here or choose files
                      </button>
                      <Typography
                        as="p"
                        role="meta"
                        className="text-muted-foreground"
                      >
                        PDF, DOCX, text, Markdown, PNG, JPEG, or WebP
                      </Typography>
                      <input
                        ref={fileInputRef}
                        type="file"
                        multiple
                        accept={ATTACHMENT_ACCEPT}
                        className="sr-only"
                        onChange={(event) => {
                          addFiles(Array.from(event.target.files ?? []));
                          event.target.value = "";
                        }}
                      />
                    </div>
                    <Typography
                      as="p"
                      role="meta"
                      className="text-muted-foreground"
                    >
                      Up to {MAX_ATTACHMENT_FILES} files, 10 MB each and 25 MB
                      together. Files upload only after you confirm the Request.
                      Reloading before then means choosing them again.
                    </Typography>

                    {fileFailure && (
                      <Feedback kind="error" variant="inline">
                        {fileFailure}
                      </Feedback>
                    )}

                    {attachments.length > 0 && (
                      <ul aria-label="Files ready to upload" className="divide-y rounded-lg border">
                        {attachments.map((attachment) => (
                          <li
                            key={attachment.key}
                            className="flex min-h-14 items-center gap-3 px-3 py-2"
                          >
                            <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
                              <AttachmentIcon file={attachment.file} />
                            </span>
                            <span className="min-w-0 flex-1">
                              <Typography
                                as="span"
                                role="label"
                                className="block truncate"
                              >
                                {attachment.file.name}
                              </Typography>
                              <Typography
                                as="span"
                                role="meta"
                                className="block text-muted-foreground"
                              >
                                {formatAttachmentSize(attachment.file.size)} ·
                                Ready to upload
                              </Typography>
                            </span>
                            <Button
                              type="button"
                              size="icon-sm"
                              variant="ghost"
                              aria-label={`Remove ${attachment.file.name}`}
                              onClick={() => removeQueuedFile(attachment.key)}
                            >
                              <XIcon aria-hidden="true" strokeWidth={1.8} />
                            </Button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </section>
                </>
              )}

              {(stage === "review" || stage === "checking") && (
                <>
                  <section className="space-y-5 rounded-xl border bg-card p-5">
                    <div>
                      <Typography as="h2" role="label">
                        Title
                      </Typography>
                      <Typography
                        as="p"
                        role="ui"
                        className="mt-2 rounded-lg border bg-muted px-3 py-2.5 font-medium"
                      >
                        {currentValues.title}
                      </Typography>
                    </div>
                    <div>
                      <Typography as="h2" role="label">
                        What happened
                      </Typography>
                      <Typography
                        as="p"
                        role="ui"
                        className="mt-2 min-h-24 whitespace-pre-wrap rounded-lg border bg-muted px-3 py-2.5"
                      >
                        {currentValues.description}
                      </Typography>
                    </div>
                  </section>

                  <section className="rounded-xl border bg-card">
                    <div className="px-5 py-4">
                      <Typography as="h2" role="sectionTitle">
                        Details you added
                      </Typography>
                      <Typography
                        as="p"
                        role="meta"
                        className="mt-1 text-muted-foreground"
                      >
                        These stay attached to the Request.
                      </Typography>
                    </div>
                    <dl className="divide-y border-t">
                      {currentValues.affectedPeople && (
                        <div className="px-5 py-3">
                          <Typography as="dt" role="label">
                            Who is affected
                          </Typography>
                          <Typography
                            as="dd"
                            role="ui"
                            className="mt-1 whitespace-pre-wrap text-muted-foreground"
                          >
                            {currentValues.affectedPeople}
                          </Typography>
                        </div>
                      )}
                      {currentValues.desiredChange && (
                        <div className="px-5 py-3">
                          <Typography as="dt" role="label">
                            What would be better
                          </Typography>
                          <Typography
                            as="dd"
                            role="ui"
                            className="mt-1 whitespace-pre-wrap text-muted-foreground"
                          >
                            {currentValues.desiredChange}
                          </Typography>
                        </div>
                      )}
                      {currentValues.observedEvidence && (
                        <div className="px-5 py-3">
                          <Typography as="dt" role="label" className="text-brand">
                            What we know · observed
                          </Typography>
                          <Typography
                            as="dd"
                            role="ui"
                            className="mt-1 whitespace-pre-wrap text-muted-foreground"
                          >
                            {currentValues.observedEvidence}
                          </Typography>
                        </div>
                      )}
                      {currentValues.uncertainty && (
                        <div className="px-5 py-3">
                          <Typography as="dt" role="label">
                            What we’re not sure about · unconfirmed
                          </Typography>
                          <Typography
                            as="dd"
                            role="ui"
                            className="mt-1 whitespace-pre-wrap text-muted-foreground"
                          >
                            {currentValues.uncertainty}
                          </Typography>
                        </div>
                      )}
                      {(currentValues.usefulLink || attachments.length > 0) && (
                        <div className="px-5 py-3">
                          <Typography as="dt" role="label">
                            Files and links
                          </Typography>
                          <Typography
                            as="dd"
                            role="ui"
                            className="mt-1 text-muted-foreground"
                          >
                            {attachments.length > 0
                              ? `${attachments.map((item) => item.file.name).join(", ")}`
                              : ""}
                            {attachments.length > 0 && currentValues.usefulLink
                              ? " · "
                              : ""}
                            {currentValues.usefulLink}
                          </Typography>
                        </div>
                      )}
                      {!currentValues.affectedPeople &&
                        !currentValues.desiredChange &&
                        !currentValues.observedEvidence &&
                        !currentValues.uncertainty &&
                        !currentValues.usefulLink &&
                        attachments.length === 0 && (
                          <Typography
                            as="p"
                            role="support"
                            className="px-5 py-4 text-muted-foreground"
                          >
                            No optional details added. That is okay.
                          </Typography>
                        )}
                    </dl>
                  </section>
                </>
              )}

              {failure && (
                <Feedback kind="error" title="Framing check not completed">
                  <span>{failure.message}</span>
                  {failure.code === "session_expired" && (
                    <>
                      {" "}
                      <Link
                        href="/login?next=%2Fintake"
                        onClick={preserveDraftForSignIn}
                        className="font-medium text-foreground underline underline-offset-4"
                      >
                        Sign in again
                      </Link>
                    </>
                  )}
                </Feedback>
              )}

              <div className="flex items-center justify-between gap-3">
                {stage !== "tell" ? (
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() =>
                      setStage(stage === "details" ? "tell" : "details")
                    }
                    disabled={checking}
                  >
                    <ArrowLeftIcon
                      aria-hidden="true"
                      data-icon="inline-start"
                      strokeWidth={1.8}
                    />
                    Back
                  </Button>
                ) : (
                  <span />
                )}
                <Button type="submit" size="lg" disabled={checking}>
                  {checking ? (
                    <LoaderCircleIcon
                      aria-hidden="true"
                      data-icon="inline-start"
                      className="animate-spin motion-reduce:animate-none"
                      strokeWidth={1.8}
                    />
                  ) : null}
                  {stage === "tell"
                    ? "Continue"
                    : stage === "details"
                      ? "Review Request"
                      : checking
                        ? "Checking wording…"
                        : "Check Request"}
                  {!checking && (
                    <ArrowRightIcon
                      aria-hidden="true"
                      data-icon="inline-end"
                      strokeWidth={1.8}
                    />
                  )}
                </Button>
              </div>

              {checking && showSlowCue && (
                <Typography
                  as="p"
                  role="support"
                  className="text-right text-muted-foreground"
                >
                  This is taking a little longer than usual. Your Request is
                  still here.
                </Typography>
              )}
            </form>

            <RequestSummary
              values={currentValues}
              files={attachments}
              step={wizardStep}
            />
          </div>
        </div>
      )}

      {(stage === "framing" || stage === "creating") && triage && source && (
        <div
          className={cn(reveal, "space-y-8")}
          aria-busy={creating || undefined}
          onKeyDown={onReviewKeyDown}
        >
          <header className="space-y-3">
            <ClassificationTag classification={triage.classification} />
            <div className="space-y-2">
              <h1
                ref={headingRef}
                tabIndex={-1}
                className={cn(
                  typographyVariants({ role: "pageTitle" }),
                  "focus:outline-none"
                )}
              >
                {classificationPresentation[triage.classification].title}
              </h1>
              <Typography
                as="p"
                role="ui"
                className="max-w-[62ch] text-pretty text-muted-foreground"
              >
                {classificationPresentation[triage.classification].description}
              </Typography>
              {restoredDraft && (
                <Feedback kind="success" variant="inline">
                  Your confirmed framing is back. Text and links were restored.
                  Choose any files again before creating the Request.
                </Feedback>
              )}
            </div>
          </header>

          {triage.classification === "problem" ? (
            <section
              aria-labelledby="problem-framing-heading"
              className="rounded-xl border border-success-border bg-success-soft p-4 sm:p-6"
            >
              <Typography
                id="problem-framing-heading"
                as="h2"
                role="label"
                className="text-success"
              >
                Problem framing
              </Typography>
              <Typography
                as="h3"
                role="sectionTitle"
                className="mt-3 max-w-none break-words"
              >
                {source.title}
              </Typography>
              <Typography
                as="p"
                role="prose"
                className="mt-2 max-w-none whitespace-pre-wrap break-words"
              >
                {source.description}
              </Typography>
            </section>
          ) : (
            <div className="grid gap-6 md:grid-cols-[minmax(0,1.2fr)_minmax(16rem,0.8fr)]">
              <section
                aria-labelledby="editable-framing-heading"
                className="min-w-0"
              >
                <Field invalid={Boolean(problemError)}>
                  <FieldLabel
                    id="editable-framing-heading"
                    htmlFor="problem-framing"
                  >
                    Problem framing
                  </FieldLabel>
                  <Textarea
                    id="problem-framing"
                    ref={problemRef}
                    value={editedProblem}
                    onChange={(event) => {
                      setEditedProblem(event.target.value);
                      if (problemError) setProblemError(null);
                    }}
                    rows={10}
                    maxLength={DESCRIPTION_MAX}
                    readOnly={creating}
                    aria-invalid={Boolean(problemError) || undefined}
                    aria-describedby={
                      problemError
                        ? "problem-framing-error"
                        : "problem-framing-description"
                    }
                    className="min-h-52 resize-y text-type-prose"
                  />
                  {problemError ? (
                    <FieldError id="problem-framing-error">
                      {problemError}
                    </FieldError>
                  ) : (
                    <FieldDescription id="problem-framing-description">
                      Edit this before creating the Request. The original stays
                      unchanged.
                    </FieldDescription>
                  )}
                </Field>
              </section>

              <aside
                aria-labelledby="source-request-heading"
                className="min-w-0 rounded-xl border bg-recessed p-4 sm:p-5"
              >
                <Typography
                  id="source-request-heading"
                  as="h2"
                  role="label"
                  className="text-muted-foreground"
                >
                  Original Request
                </Typography>
                <Typography
                  as="h3"
                  role="sectionTitle"
                  className="mt-3 max-w-none break-words"
                >
                  {source.title}
                </Typography>
                <Typography
                  as="p"
                  role="ui"
                  className="mt-2 whitespace-pre-wrap break-words text-muted-foreground"
                >
                  {source.description}
                </Typography>

                {triage.classification === "hybrid" &&
                  triage.extractedSolution && (
                    <div className="mt-5 border-t pt-5">
                      <div className="flex items-center gap-2 text-warning">
                        <LightbulbIcon
                          aria-hidden="true"
                          className="size-4 shrink-0"
                          strokeWidth={1.8}
                        />
                        <Typography as="h3" role="label">
                          Solution idea, preserved
                        </Typography>
                      </div>
                      <Typography
                        as="p"
                        role="ui"
                        className="mt-2 break-words text-muted-foreground"
                      >
                        {triage.extractedSolution}
                      </Typography>
                    </div>
                  )}
              </aside>
            </div>
          )}

          {failure && (
            <Feedback kind="error" title="Request not created">
              <span>{failure.message}</span>
              {failure.code === "session_expired" && (
                <>
                  {" "}
                  <Link
                    href="/login?next=%2Fintake"
                    onClick={preserveDraftForSignIn}
                    className="font-medium text-foreground underline underline-offset-4"
                  >
                    Sign in again
                  </Link>
                </>
              )}
            </Feedback>
          )}

          <div className="flex flex-col gap-3 sm:flex-row">
            <Button
              type="button"
              size="lg"
              className="flex-1"
              onClick={
                failure?.code === "review_expired"
                  ? () => source && void checkFraming(source)
                  : () => void onConfirm()
              }
              disabled={creating}
              aria-busy={creating || undefined}
            >
              {creating && (
                <LoaderCircleIcon
                  aria-hidden="true"
                  data-icon="inline-start"
                  className="animate-spin motion-reduce:animate-none"
                  strokeWidth={1.8}
                />
              )}
              {creating
                ? "Creating Request…"
                : failure?.code === "review_expired"
                  ? "Check wording again"
                  : "Create Request"}
            </Button>
            <Button
              type="button"
              size="lg"
              variant="outline"
              onClick={() => {
                setFailure(null);
                setStage("review");
              }}
              disabled={creating}
              className="sm:min-w-40"
            >
              Edit Request
            </Button>
          </div>

          {!creating && (
            <Typography
              as="p"
              role="meta"
              className="hidden text-center text-muted-foreground sm:block"
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
            </Typography>
          )}
        </div>
      )}

      {(stage === "uploading" || stage === "attachment_recovery") &&
        createdRequestId && (
          <div className={cn(reveal, "mx-auto max-w-[680px] space-y-6")}>
            <header className="space-y-2">
              <Typography
                as="p"
                role="micro"
                className="font-semibold tracking-[0.08em] text-brand uppercase"
              >
                Request created
              </Typography>
              <h1
                ref={headingRef}
                tabIndex={-1}
                className={cn(
                  typographyVariants({ role: "pageTitle" }),
                  "focus:outline-none"
                )}
              >
                {stage === "uploading"
                  ? "Adding your files."
                  : "Your Request is safe."}
              </h1>
              <Typography
                as="p"
                role="ui"
                className="text-muted-foreground"
              >
                {stage === "uploading"
                  ? "Keep this tab open while the selected files upload."
                  : "One or more files need attention. Retry them, remove them, or continue without them."}
              </Typography>
            </header>

            <ul aria-label="Request file uploads" className="divide-y rounded-xl border bg-card">
              {attachments.map((attachment) => (
                <li key={attachment.key} className="flex gap-3 px-4 py-3">
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                    <AttachmentIcon file={attachment.file} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <Typography as="p" role="label" className="truncate">
                      {attachment.file.name}
                    </Typography>
                    <div className="mt-1 flex items-center justify-between gap-3">
                      <Typography
                        as="p"
                        role="meta"
                        className={cn(
                          "text-muted-foreground",
                          attachment.status === "failed" && "text-destructive",
                          attachment.status === "uploaded" && "text-success"
                        )}
                      >
                        {attachment.status === "queued"
                          ? "Waiting"
                          : attachment.status === "uploading"
                            ? `${attachment.progress}% uploaded`
                            : attachment.status === "uploaded"
                              ? "Uploaded"
                              : "Upload failed"}
                      </Typography>
                      {attachment.status === "uploaded" && (
                        <CheckIcon
                          aria-hidden="true"
                          className="size-4 shrink-0 text-success"
                          strokeWidth={2}
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
                      <Typography
                        as="p"
                        role="meta"
                        className="mt-2 text-destructive"
                      >
                        {attachment.error}
                      </Typography>
                    )}
                    {stage === "attachment_recovery" &&
                      attachment.status === "failed" && (
                        <div className="mt-3 flex flex-wrap gap-2">
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() =>
                              void retryAttachments([attachment])
                            }
                          >
                            <RotateCcwIcon
                              aria-hidden="true"
                              data-icon="inline-start"
                              strokeWidth={1.8}
                            />
                            Try again
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            onClick={() => void removeFailedFile(attachment)}
                          >
                            <Trash2Icon
                              aria-hidden="true"
                              data-icon="inline-start"
                              strokeWidth={1.8}
                            />
                            Remove
                          </Button>
                        </div>
                      )}
                  </div>
                </li>
              ))}
            </ul>

            {stage === "attachment_recovery" && (
              <div className="flex flex-col gap-3 sm:flex-row">
                <Button
                  type="button"
                  className="flex-1"
                  onClick={() => void retryFailedFiles()}
                >
                  <RotateCcwIcon
                    aria-hidden="true"
                    data-icon="inline-start"
                    strokeWidth={1.8}
                  />
                  Retry failed files
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="flex-1"
                  onClick={() => void continueWithoutFailedFiles()}
                >
                  Continue without them
                </Button>
              </div>
            )}
          </div>
        )}
    </main>
  );
}
