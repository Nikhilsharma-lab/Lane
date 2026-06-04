"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
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

export default function IntakePage() {
  const [stage, setStage] = useState<Stage>("form");
  const [triage, setTriage] = useState<TriageResult | null>(null);
  const [formValues, setFormValues] = useState<FormData | null>(null);
  const [editedProblem, setEditedProblem] = useState("");
  const [savedId, setSavedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
  } = useForm<FormData>({
    defaultValues: { title: "", description: "" },
  });

  async function onSubmit(data: FormData) {
    setError(null);
    setStage("analyzing");
    setFormValues(data);

    const result: TriageResponse = await runTriage(data);

    if (!result.success) {
      setError(result.error);
      setStage("form");
      return;
    }

    setTriage(result.triage);

    if (result.triage.classification === "problem") {
      // Already problem-framed — light confirmation, then save directly
      setStage("gate");
    } else {
      // Solution or hybrid — show reframing for review
      setEditedProblem(result.triage.reframedProblem || "");
      setStage("gate");
    }
  }

  async function onConfirm() {
    if (!formValues || !triage) return;
    setStage("saving");

    const result: SaveResponse = await saveRequest({
      title: formValues.title,
      description: formValues.description,
      classification: triage.classification,
      reframedProblem:
        triage.classification !== "problem" ? editedProblem : null,
      extractedSolution: triage.extractedSolution,
    });

    if (!result.success) {
      setError(result.error);
      setStage("gate");
      return;
    }

    setSavedId(result.requestId);
    setStage("done");
  }

  function onStartOver() {
    setStage("form");
    setTriage(null);
    setFormValues(null);
    setEditedProblem("");
    setSavedId(null);
    setError(null);
    reset();
  }

  // ─── Form stage ────────────────────────────────────────────────
  if (stage === "form" || stage === "analyzing") {
    return (
      <div className="mx-auto w-full max-w-2xl px-4 py-12">
        <div className="mb-8">
          <h1 className="text-2xl font-semibold tracking-tight">
            New request
          </h1>
          <p className="mt-1 text-muted-foreground">
            Describe what you need. Lane will help frame the problem before
            your team sees it.
          </p>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="title">Title</Label>
            <Input
              id="title"
              placeholder="A short name for this request"
              {...register("title", {
                required: "Title is required",
                minLength: { value: 3, message: "At least 3 characters" },
              })}
              disabled={stage === "analyzing"}
            />
            {errors.title && (
              <p className="text-sm text-destructive">
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
              {...register("description", {
                required: "Description is required",
                minLength: { value: 10, message: "Tell us a bit more — at least 10 characters" },
              })}
              disabled={stage === "analyzing"}
            />
            {errors.description && (
              <p className="text-sm text-destructive">
                {errors.description.message}
              </p>
            )}
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <Button
            type="submit"
            className="w-full"
            disabled={stage === "analyzing"}
          >
            {stage === "analyzing" ? "Analyzing..." : "Submit request"}
          </Button>
        </form>
      </div>
    );
  }

  // ─── Gate stage ────────────────────────────────────────────────
  if ((stage === "gate" || stage === "saving") && triage && formValues) {
    const isProblem = triage.classification === "problem";

    return (
      <div className="mx-auto w-full max-w-2xl px-4 py-12">
        <div className="mb-8">
          <h1 className="text-2xl font-semibold tracking-tight">
            {isProblem ? "Looks good" : "Let’s reframe this"}
          </h1>
          <p className="mt-1 text-muted-foreground">
            {isProblem
              ? "Your request is already framed as a problem. Nice work."
              : "Lane noticed your request describes a solution. Here’s the underlying problem your team can rally around."}
          </p>
        </div>

        {/* Original request */}
        <Card className="mb-6">
          <CardHeader>
            <CardDescription>Your request</CardDescription>
            <CardTitle className="text-base">{formValues.title}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground whitespace-pre-wrap">
              {formValues.description}
            </p>
          </CardContent>
        </Card>

        {/* Reframed problem (for solution/hybrid) */}
        {!isProblem && (
          <Card className="mb-6 border-primary/20 bg-primary/[0.02]">
            <CardHeader>
              <CardDescription>
                {triage.classification === "hybrid"
                  ? "The problem underneath your idea"
                  : "The problem underneath"}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <Textarea
                value={editedProblem}
                onChange={(e) => setEditedProblem(e.target.value)}
                rows={4}
                className="bg-background"
                disabled={stage === "saving"}
              />
              <p className="text-xs text-muted-foreground">
                You can edit this before confirming. Your original description
                is preserved.
              </p>
            </CardContent>
          </Card>
        )}

        {/* Extracted solution (for hybrid only) */}
        {triage.classification === "hybrid" && triage.extractedSolution && (
          <Card className="mb-6">
            <CardHeader>
              <CardDescription>Your proposed solution (preserved)</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                {triage.extractedSolution}
              </p>
            </CardContent>
          </Card>
        )}

        {/* Suggestions */}
        {triage.suggestions.length > 0 && (
          <div className="mb-6">
            <p className="mb-2 text-sm font-medium text-muted-foreground">
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

        {error && <p className="mb-4 text-sm text-destructive">{error}</p>}

        <div className="flex gap-3">
          <Button
            onClick={onConfirm}
            disabled={stage === "saving" || (!isProblem && !editedProblem.trim())}
            className="flex-1"
          >
            {stage === "saving"
              ? "Saving..."
              : isProblem
                ? "Confirm and submit"
                : "Accept reframing and submit"}
          </Button>
          <Button
            variant="outline"
            onClick={onStartOver}
            disabled={stage === "saving"}
          >
            Start over
          </Button>
        </div>
      </div>
    );
  }

  // ─── Done stage ────────────────────────────────────────────────
  if (stage === "done" && triage && formValues) {
    return (
      <div className="mx-auto w-full max-w-2xl px-4 py-12">
        <div className="mb-8">
          <h1 className="text-2xl font-semibold tracking-tight">
            Request submitted
          </h1>
          <p className="mt-1 text-muted-foreground">
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
            <CardTitle className="text-base">{formValues.title}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {triage.classification !== "problem" && editedProblem ? (
              <p className="text-sm whitespace-pre-wrap">{editedProblem}</p>
            ) : (
              <p className="text-sm whitespace-pre-wrap">
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
    );
  }

  return null;
}
