"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { useForm } from "react-hook-form";
import { Loader2Icon, SparklesIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  runTriage,
  saveRequest,
  type TriageResponse,
  type SaveResponse,
} from "./actions";
import type { TriageResult } from "@/lib/ai/triage";

type FormData = { title: string; description: string };

type Stage = "form" | "analyzing" | "gate" | "saving" | "done";

// Client mirrors of the server's zod limits (actions.ts) so users can't
// overshoot and learn about it only on submit.
const TITLE_MAX = 200;
const DESCRIPTION_MAX = 5000;

// The verdict reveal — one entrance, gated behind motion-safe so reduced-motion
// users get the content instantly with no transition.
const reveal =
  "motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-2 motion-safe:duration-200 motion-safe:ease-out";

export default function IntakePage({
  context,
}: {
  context: { userId: string; orgId: string };
}) {
  const [stage, setStage] = useState<Stage>("form");
  const [triage, setTriage] = useState<TriageResult | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [formValues, setFormValues] = useState<FormData | null>(null);
  const [editedProblem, setEditedProblem] = useState("");
  const [error, setError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
  } = useForm<FormData>({
    defaultValues: { title: "", description: "" },
  });

  const analyzing = stage === "analyzing";
  const saving = stage === "saving";

  // Synchronous re-entry guard. React state (stage) updates asynchronously, so
  // a rapid double Enter/click would otherwise fire the server action twice —
  // and saveRequest doesn't consume its token, so that inserts a duplicate
  // request. This ref flips synchronously and blocks the second call.
  const inFlight = useRef(false);

  // Three views; analyzing shares the form view, saving shares the gate view.
  const view =
    stage === "form" || stage === "analyzing"
      ? "form"
      : stage === "gate" || stage === "saving"
        ? "gate"
        : "done";

  const isProblem = triage?.classification === "problem";

  // Show the platform-correct modifier. Read as external browser state so SSR
  // and the first client render both see "Ctrl" (server snapshot), then macOS
  // upgrades to ⌘ after hydration — no mismatch, no setState-in-effect.
  const isMac = useSyncExternalStore(
    useCallback(() => () => {}, []),
    () => /Mac|iPhone|iPad|iPod/.test(`${navigator.platform} ${navigator.userAgent}`),
    () => false
  );
  const modKey = isMac ? "⌘" : "Ctrl";

  // Move focus to the heading when the view changes, so keyboard and screen
  // reader users land at the top of the new stage. Skip the initial mount.
  const headingRef = useRef<HTMLHeadingElement>(null);
  const prevView = useRef(view);
  const firstRender = useRef(true);
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      prevView.current = view;
      return;
    }
    if (view !== prevView.current) {
      prevView.current = view;
      headingRef.current?.focus();
    }
  }, [view]);

  // Live status, announced politely via the single persistent region below.
  const srStatus = analyzing
    ? "Analyzing your request."
    : stage === "gate"
      ? isProblem
        ? "Your request is already framed as a problem."
        : "Lane reframed your request as a problem. Review it below."
      : saving
        ? "Saving your request."
        : stage === "done"
          ? "Request submitted."
          : "";

  const onStartOver = useCallback(() => {
    inFlight.current = false;
    setStage("form");
    setTriage(null);
    setToken(null);
    setFormValues(null);
    setEditedProblem("");
    setError(null);
    reset();
  }, [reset]);

  // Esc exits the gate back to a fresh form (unless a save is in flight).
  useEffect(() => {
    if (view !== "gate") return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !inFlight.current) {
        e.preventDefault();
        onStartOver();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [view, onStartOver]);

  // Triage writes nothing to the DB, so a stray double-call is harmless (and
  // rate-limited server-side); the disabled button plus this state guard are
  // enough. The synchronous ref mutex is reserved for onConfirm, which inserts.
  async function onSubmit(data: FormData) {
    if (analyzing) return;
    setError(null);
    setStage("analyzing");
    setFormValues(data);

    const result: TriageResponse = await runTriage(data, context);

    if (!result.success) {
      setError(result.error);
      setStage("form");
      return;
    }

    setTriage(result.triage);
    setToken(result.token);

    if (result.triage.classification !== "problem") {
      setEditedProblem(result.triage.reframedProblem || "");
    }
    setStage("gate");
  }

  async function onConfirm() {
    if (inFlight.current) return;
    if (!formValues || !triage || !token) return;
    inFlight.current = true;
    setStage("saving");

    try {
      const result: SaveResponse = await saveRequest(
        {
          token,
          editedProblemText:
            triage.classification !== "problem" ? editedProblem : null,
        },
        context
      );

      if (!result.success) {
        setError(result.error);
        setStage("gate");
        return;
      }

      setStage("done");
    } finally {
      inFlight.current = false;
    }
  }

  // Cmd/Ctrl+Enter submits from anywhere in the form (including the textarea).
  function onFormKeyDown(e: React.KeyboardEvent<HTMLFormElement>) {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && !analyzing) {
      e.preventDefault();
      void handleSubmit(onSubmit)();
    }
  }

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-12">
      {/* Single persistent live region: exists empty first, then receives text,
          so screen readers reliably announce each stage change. */}
      <p className="sr-only" role="status" aria-live="polite">
        {srStatus}
      </p>

      {/* ─── Form view ─────────────────────────────────────────── */}
      {view === "form" && (
        <>
          <div className="mb-8">
            <h1
              ref={headingRef}
              tabIndex={-1}
              className="text-3xl font-semibold tracking-tight text-balance focus:outline-none"
            >
              New request
            </h1>
            <p className="mt-2 text-muted-foreground text-pretty">
              Describe what you need. Lane will help frame the problem before
              your team sees it.
            </p>
          </div>

          <form
            onSubmit={handleSubmit(onSubmit)}
            onKeyDown={onFormKeyDown}
            className="space-y-6"
          >
            <div className="space-y-2">
              <Label htmlFor="title">Title</Label>
              <Input
                id="title"
                placeholder="A short name for this request"
                maxLength={TITLE_MAX}
                aria-invalid={!!errors.title}
                aria-describedby={errors.title ? "title-error" : undefined}
                {...register("title", {
                  required: "Title is required",
                  minLength: { value: 3, message: "At least 3 characters" },
                  maxLength: {
                    value: TITLE_MAX,
                    message: `At most ${TITLE_MAX} characters`,
                  },
                })}
                disabled={analyzing}
              />
              {errors.title && (
                <p
                  id="title-error"
                  role="alert"
                  className="text-sm text-destructive"
                >
                  {errors.title.message}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                placeholder="What's the problem you're trying to solve? Or, if you have a specific idea, describe it here — Lane will help uncover the problem underneath."
                rows={6}
                maxLength={DESCRIPTION_MAX}
                aria-invalid={!!errors.description}
                aria-describedby={
                  errors.description ? "description-error" : undefined
                }
                {...register("description", {
                  required: "Description is required",
                  minLength: {
                    value: 10,
                    message: "Tell us a bit more — at least 10 characters",
                  },
                  maxLength: {
                    value: DESCRIPTION_MAX,
                    message: `At most ${DESCRIPTION_MAX.toLocaleString()} characters`,
                  },
                })}
                disabled={analyzing}
              />
              {errors.description && (
                <p
                  id="description-error"
                  role="alert"
                  className="text-sm text-destructive"
                >
                  {errors.description.message}
                </p>
              )}
            </div>

            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}

            <Button type="submit" className="w-full" disabled={analyzing}>
              {analyzing ? (
                <>
                  <Loader2Icon aria-hidden="true" className="animate-spin" />
                  Analyzing…
                </>
              ) : (
                "Submit request"
              )}
            </Button>

            {analyzing && (
              <p
                className="text-center text-sm text-brand"
                aria-hidden="true"
              >
                Reading your request and checking how it&apos;s framed…
              </p>
            )}
            {!analyzing && (
              <p className="text-center text-xs text-muted-foreground">
                Press{" "}
                <kbd className="rounded border bg-muted px-1 font-mono text-xs">
                  {modKey}
                </kbd>{" "}
                +{" "}
                <kbd className="rounded border bg-muted px-1 font-mono text-xs">
                  Enter
                </kbd>{" "}
                to submit.
              </p>
            )}
          </form>
        </>
      )}

      {/* ─── Gate view ─────────────────────────────────────────── */}
      {view === "gate" && triage && formValues && (
        <div
          className={reveal}
          onKeyDown={(e) => {
            if (
              e.key === "Enter" &&
              (e.metaKey || e.ctrlKey) &&
              !saving &&
              (isProblem || editedProblem.trim())
            ) {
              e.preventDefault();
              void onConfirm();
            }
          }}
        >
          <div className="mb-8">
            <h1
              ref={headingRef}
              tabIndex={-1}
              className="text-4xl font-semibold tracking-tight text-balance focus:outline-none"
            >
              {isProblem ? "Looks good" : "Let's reframe this"}
            </h1>
            <p className="mt-2 text-muted-foreground text-pretty">
              {isProblem
                ? "Your request is already framed as a problem. Nice work."
                : "Lane noticed your request describes a solution. Here's the underlying problem your team can rally around."}
            </p>
          </div>

          {/* Hero: the reframed problem — the one place the signal leads. */}
          {!isProblem ? (
            <Card className="mb-6 ring-2 ring-brand/30 bg-brand/[0.05]">
              <CardHeader>
                <div className="flex items-center gap-1.5 text-brand">
                  <SparklesIcon aria-hidden="true" className="size-3.5" />
                  <span className="text-xs font-medium">Reframed by Lane</span>
                </div>
                <Label
                  htmlFor="reframed-problem"
                  className="text-base font-medium"
                >
                  {triage.classification === "hybrid"
                    ? "The problem underneath your idea"
                    : "The problem underneath"}
                </Label>
              </CardHeader>
              <CardContent className="space-y-3">
                <Textarea
                  id="reframed-problem"
                  value={editedProblem}
                  onChange={(e) => setEditedProblem(e.target.value)}
                  rows={4}
                  maxLength={DESCRIPTION_MAX}
                  className="bg-background"
                  disabled={saving}
                />
                <p className="text-xs text-muted-foreground">
                  You can edit this before confirming. Your original
                  description is preserved.
                </p>
              </CardContent>
            </Card>
          ) : (
            <Card className="mb-6">
              <CardHeader>
                <CardDescription>Problem</CardDescription>
                <CardTitle className="text-base break-words">
                  {formValues.title}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm whitespace-pre-wrap break-words">
                  {formValues.description}
                </p>
              </CardContent>
            </Card>
          )}

          {/* Suggestions */}
          {triage.suggestions.length > 0 && (
            <div className="mb-6">
              <p className="mb-2 text-sm font-medium">
                Suggestions to strengthen this request
              </p>
              <ul className="space-y-1">
                {triage.suggestions.map((s, i) => (
                  <li
                    key={i}
                    className="text-sm text-muted-foreground before:mr-2 before:content-['·']"
                  >
                    {s}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* The original request, demoted to a quiet reference. */}
          {!isProblem && (
            <details className="group mb-6 rounded-lg border bg-muted/30 px-4 py-3 text-sm">
              <summary className="flex cursor-pointer list-none items-center justify-between font-medium text-muted-foreground transition-colors select-none hover:text-foreground">
                <span>Your original request</span>
                <span className="text-xs transition-transform group-open:rotate-90">
                  ›
                </span>
              </summary>
              <div className="mt-3 space-y-3 border-t pt-3">
                <div>
                  <p className="font-medium text-foreground break-words">
                    {formValues.title}
                  </p>
                  <p className="mt-1 whitespace-pre-wrap break-words text-muted-foreground">
                    {formValues.description}
                  </p>
                </div>
                {triage.classification === "hybrid" &&
                  triage.extractedSolution && (
                    <div className="border-t pt-3">
                      <p className="font-medium text-foreground">
                        Your proposed solution (preserved)
                      </p>
                      <p className="mt-1 break-words text-muted-foreground">
                        {triage.extractedSolution}
                      </p>
                    </div>
                  )}
              </div>
            </details>
          )}

          {error && (
            <p role="alert" className="mb-4 text-sm text-destructive">
              {error}
            </p>
          )}

          <div className="flex flex-col gap-3 sm:flex-row">
            <Button
              onClick={onConfirm}
              disabled={saving || (!isProblem && !editedProblem.trim())}
              className="flex-1"
            >
              {saving ? (
                <>
                  <Loader2Icon aria-hidden="true" className="animate-spin" />
                  Saving…
                </>
              ) : isProblem ? (
                "Confirm and submit"
              ) : (
                "Accept reframing and submit"
              )}
            </Button>
            <Button variant="outline" onClick={onStartOver} disabled={saving}>
              Start over
            </Button>
          </div>
          <p className="mt-3 text-center text-xs text-muted-foreground">
            <kbd className="rounded border bg-muted px-1 font-mono text-xs">
              Esc
            </kbd>{" "}
            to start over.
          </p>
        </div>
      )}

      {/* ─── Done view ─────────────────────────────────────────── */}
      {view === "done" && triage && formValues && (
        <div className={reveal}>
          <div className="mb-8">
            <h1
              ref={headingRef}
              tabIndex={-1}
              className="text-3xl font-semibold tracking-tight text-balance focus:outline-none"
            >
              Request submitted
            </h1>
            <p className="mt-2 text-muted-foreground text-pretty">
              Your request is now open for the team to pick up.
            </p>
          </div>

          <Card className="mb-6">
            <CardHeader>
              <CardDescription>
                {triage.classification === "problem"
                  ? "Problem"
                  : "Reframed problem"}
              </CardDescription>
              <CardTitle className="text-base break-words">
                {formValues.title}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {triage.classification !== "problem" && editedProblem ? (
                <p className="text-sm whitespace-pre-wrap break-words">
                  {editedProblem}
                </p>
              ) : (
                <p className="text-sm whitespace-pre-wrap break-words">
                  {formValues.description}
                </p>
              )}
              <p className="text-xs text-muted-foreground">
                Status: Open · Waiting to be picked up
              </p>
            </CardContent>
          </Card>

          <Button onClick={onStartOver} variant="outline" className="w-full">
            Submit another request
          </Button>
        </div>
      )}
    </div>
  );
}
