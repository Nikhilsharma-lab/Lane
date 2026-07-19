"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  CircleCheckIcon,
  GitMergeIcon,
  LightbulbIcon,
  LoaderCircleIcon,
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
import { Textarea } from "@/components/ui/textarea";
import {
  Typography,
  typographyVariants,
} from "@/components/ui/typography";
import type { TriageResult } from "@/lib/ai/triage";
import {
  DESCRIPTION_MAX,
  problemFramingSchema,
  requestSchema,
  TITLE_MAX,
  type RequestInput,
} from "@/lib/request-schema";
import { cn } from "@/lib/utils";

import {
  runTriage,
  saveRequest,
  type IntakeFailure,
  type SaveResponse,
  type TriageResponse,
} from "./actions";

type Stage = "form" | "checking" | "review" | "creating";

const reveal =
  "motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-2 motion-safe:duration-200 motion-safe:ease-out";

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

export default function IntakeForm({
  context,
}: {
  context: { orgId: string };
}) {
  const router = useRouter();
  const [stage, setStage] = useState<Stage>("form");
  const [triage, setTriage] = useState<TriageResult | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [source, setSource] = useState<RequestInput | null>(null);
  const [editedProblem, setEditedProblem] = useState("");
  const [problemError, setProblemError] = useState<string | null>(null);
  const [failure, setFailure] = useState<IntakeFailure | null>(null);
  const [showSlowCue, setShowSlowCue] = useState(false);

  const operationInFlight = useRef(false);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const problemRef = useRef<HTMLTextAreaElement>(null);

  const {
    register,
    handleSubmit,
    setError,
    setFocus,
    formState: { errors },
  } = useForm<RequestInput>({
    resolver: zodResolver(requestSchema),
    defaultValues: { title: "", description: "" },
  });

  const checking = stage === "checking";
  const creating = stage === "creating";
  const view = stage === "form" || checking ? "form" : "review";

  const isMac = useSyncExternalStore(
    useCallback(() => () => {}, []),
    () =>
      /Mac|iPhone|iPad|iPod/.test(
        `${navigator.platform} ${navigator.userAgent}`
      ),
    () => false
  );
  const modKey = isMac ? "⌘" : "Ctrl";

  const previousView = useRef(view);
  const firstRender = useRef(true);
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      previousView.current = view;
      return;
    }

    if (view !== previousView.current) {
      previousView.current = view;
      headingRef.current?.focus();
    }
  }, [view]);

  useEffect(() => {
    if (!checking) return;

    const timer = window.setTimeout(() => setShowSlowCue(true), 5_000);
    return () => window.clearTimeout(timer);
  }, [checking]);

  const liveStatus =
    stage === "checking"
      ? "Checking the Request framing."
      : stage === "review" && triage
        ? `${classificationPresentation[triage.classification].label} result ready to review.`
        : stage === "creating"
          ? "Creating the Request."
          : "";

  async function checkFraming(data: RequestInput) {
    if (operationInFlight.current) return;
    operationInFlight.current = true;
    setFailure(null);
    setProblemError(null);
    setSource(data);
    setShowSlowCue(false);
    setStage("checking");

    try {
      const result: TriageResponse = await runTriage(data, context);
      if (!result.success) {
        if (
          result.error.code === "validation" &&
          (result.error.field === "title" ||
            result.error.field === "description")
        ) {
          setError(result.error.field, {
            type: "server",
            message: result.error.message,
          });
          setFocus(result.error.field);
        } else {
          setFailure(result.error);
        }
        setStage("form");
        return;
      }

      setTriage(result.triage);
      setToken(result.token);
      setEditedProblem(result.triage.reframedProblem ?? "");
      setStage("review");
    } catch {
      setFailure(clientNetworkFailure);
      setStage("form");
    } finally {
      operationInFlight.current = false;
    }
  }

  function onEditOriginal() {
    if (operationInFlight.current) return;
    setStage("form");
    setTriage(null);
    setToken(null);
    setSource(null);
    setEditedProblem("");
    setProblemError(null);
    setFailure(null);
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
        setStage("review");
        return;
      }

      toast.success("Request created", {
        description: "Open and ready to be picked up.",
      });
      router.push(`/requests/${result.requestId}`);
    } catch {
      setFailure({
        code: "save_failed",
        message:
          "Lane could not create this Request. Your confirmed framing is still here. Try again.",
      });
      setStage("review");
    } finally {
      operationInFlight.current = false;
    }
  }

  async function onReviewAgain() {
    if (!source) return;
    await checkFraming(source);
  }

  function onFormKeyDown(event: React.KeyboardEvent<HTMLFormElement>) {
    if (
      event.key === "Enter" &&
      (event.metaKey || event.ctrlKey) &&
      !checking
    ) {
      event.preventDefault();
      void handleSubmit(checkFraming)();
    }
  }

  function onFormSubmit(event: React.FormEvent<HTMLFormElement>) {
    void handleSubmit(checkFraming)(event);
  }

  function onReviewKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (
      event.key === "Enter" &&
      (event.metaKey || event.ctrlKey) &&
      !creating
    ) {
      event.preventDefault();
      if (failure?.code === "review_expired") {
        void onReviewAgain();
      } else {
        void onConfirm();
      }
    }
  }

  return (
    <main
      className={cn(
        "mx-auto w-full px-4 py-8 sm:px-6 sm:py-12",
        view === "form" ? "max-w-[680px]" : "max-w-[920px]"
      )}
    >
      <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {liveStatus}
      </p>

      {view === "form" && (
        <div className={reveal}>
          <header className="mb-8 space-y-2">
            <h1
              ref={headingRef}
              tabIndex={-1}
              className={cn(
                typographyVariants({ role: "pageTitle" }),
                "focus:outline-none"
              )}
            >
              New Request
            </h1>
            <Typography
              as="p"
              role="ui"
              className="max-w-[62ch] text-muted-foreground text-pretty"
            >
              Describe the need in your own words. Lane checks the framing
              before anything is saved.
            </Typography>
          </header>

          <form
            noValidate
            aria-busy={checking || undefined}
            onSubmit={onFormSubmit}
            onKeyDown={onFormKeyDown}
            className="space-y-6"
          >
            <Field invalid={Boolean(errors.title)} disabled={checking}>
              <FieldLabel htmlFor="intake-title">Title</FieldLabel>
              <Input
                id="intake-title"
                aria-invalid={Boolean(errors.title) || undefined}
                aria-describedby={
                  errors.title ? "intake-title-error" : undefined
                }
                placeholder="A short name for this Request"
                maxLength={TITLE_MAX}
                disabled={checking}
                {...register("title")}
              />
              {errors.title && (
                <FieldError id="intake-title-error">
                  {errors.title.message}
                </FieldError>
              )}
            </Field>

            <Field invalid={Boolean(errors.description)} disabled={checking}>
              <FieldLabel htmlFor="intake-description">
                What is happening?
              </FieldLabel>
              <Textarea
                id="intake-description"
                aria-invalid={Boolean(errors.description) || undefined}
                aria-describedby={
                  errors.description
                    ? "intake-description-error"
                    : undefined
                }
                placeholder="Describe the need, friction, or idea. Lane will help separate the problem from a proposed answer."
                rows={8}
                maxLength={DESCRIPTION_MAX}
                disabled={checking}
                className="min-h-40 resize-y"
                {...register("description")}
              />
              {errors.description && (
                <FieldError id="intake-description-error">
                  {errors.description.message}
                </FieldError>
              )}
            </Field>

            {failure && (
              <Feedback kind="error" title="Framing check not completed">
                <span>{failure.message}</span>
                {failure.code === "session_expired" && (
                  <>
                    {" "}
                    <Link
                      href="/login?redirectTo=/intake"
                      className="font-medium text-foreground underline underline-offset-4"
                    >
                      Sign in again
                    </Link>
                  </>
                )}
              </Feedback>
            )}

            <div className="space-y-3">
              <Button
                type="submit"
                size="lg"
                className={cn(
                  "w-full",
                  checking &&
                    "disabled:bg-primary disabled:text-primary-foreground"
                )}
                disabled={checking}
                aria-busy={checking || undefined}
              >
                {checking && (
                  <LoaderCircleIcon
                    aria-hidden="true"
                    data-icon="inline-start"
                    className="animate-spin motion-reduce:animate-none"
                    strokeWidth={1.8}
                  />
                )}
                {checking ? "Checking framing…" : "Review framing"}
              </Button>

              <Typography
                as="p"
                role="support"
                className="text-center text-muted-foreground"
              >
                Nothing is saved until you confirm.
              </Typography>

              {showSlowCue && (
                <Typography
                  as="p"
                  role="support"
                  className="text-center text-muted-foreground"
                >
                  This is taking a little longer than usual. Your Request is
                  still here.
                </Typography>
              )}

              {!checking && (
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
                  to review.
                </Typography>
              )}
            </div>
          </form>
        </div>
      )}

      {view === "review" && triage && source && (
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
                className="max-w-[62ch] text-muted-foreground text-pretty"
              >
                {classificationPresentation[triage.classification].description}
              </Typography>
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
                className="min-w-0 rounded-xl border border-border bg-recessed p-4 sm:p-5"
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
                    <div className="mt-5 border-t border-border pt-5">
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
                    href="/login?redirectTo=/intake"
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
              className={cn(
                "flex-1",
                creating &&
                  "disabled:bg-primary disabled:text-primary-foreground"
              )}
              onClick={
                failure?.code === "review_expired"
                  ? () => void onReviewAgain()
                  : () => void onConfirm()
              }
              disabled={
                creating
              }
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
                  ? "Review framing again"
                  : "Create Request"}
            </Button>
            <Button
              type="button"
              size="lg"
              variant="outline"
              onClick={onEditOriginal}
              disabled={creating}
              className="sm:min-w-40"
            >
              Edit original
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
    </main>
  );
}
