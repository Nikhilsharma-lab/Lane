"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { NativeSelect } from "@/components/ui/native-select";
import { Badge } from "@/components/ui/badge";
import { SectionLabel } from "@/components/ui/section-label";

interface Props {
  onClose: () => void;
  projects: { id: string; name: string; color: string }[];
}

interface PreflightResult {
  qualityScore: number;
  qualityFlags: string[];
  suggestions: string[];
  potentialDuplicates: Array<{ id: string; title: string; reason: string }>;
  classification: "problem_framed" | "solution_specific" | "hybrid";
  reframedProblem: string | null;
}

export function NewRequestForm({ onClose, projects }: Props) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preflight, setPreflight] = useState<PreflightResult | null>(null);
  const [preflightLoading, setPreflightLoading] = useState(false);
  const [preflightError, setPreflightError] = useState<string | null>(null);
  const [showIntakeGate, setShowIntakeGate] = useState(false);
  const [intakeJustification, setIntakeJustification] = useState("");
  const [showJustificationField, setShowJustificationField] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const form = new FormData(e.currentTarget);
    const body = {
      title: form.get("title"),
      description: form.get("description"),
      businessContext: form.get("businessContext") || null,
      successMetrics: form.get("successMetrics") || null,
      figmaUrl: form.get("figmaUrl") || null,
      impactMetric: form.get("impactMetric") || null,
      impactPrediction: form.get("impactPrediction") || null,
      deadlineAt: form.get("deadlineAt") || null,
      projectId: form.get("projectId") || null,
      intakeJustification: intakeJustification.trim() || null,
    };

    const res = await fetch("/api/requests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const data = await res.json();
      setError(data.error ?? "Something went wrong");
      setLoading(false);
      return;
    }

    router.refresh();
    onClose();
  }

  async function handlePreflight() {
    if (!formRef.current) return;
    const form = new FormData(formRef.current);
    const title = (form.get("title") as string) ?? "";
    const description = (form.get("description") as string) ?? "";

    if (!title.trim() || !description.trim()) {
      setPreflightError("Add a title and description first");
      return;
    }

    setPreflightLoading(true);
    setPreflightError(null);
    setPreflight(null);

    try {
      const res = await fetch("/api/requests/preflight", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          description,
          businessContext: (form.get("businessContext") as string) || undefined,
          successMetrics: (form.get("successMetrics") as string) || undefined,
          impactMetric: (form.get("impactMetric") as string) || undefined,
          impactPrediction: (form.get("impactPrediction") as string) || undefined,
        }),
      });

      if (!res.ok) throw new Error("preflight_failed");
      const data: PreflightResult = await res.json();
      setPreflight(data);
      if (data.classification === "solution_specific" || data.classification === "hybrid") {
        setShowIntakeGate(true);
      }
    } catch {
      setPreflightError("Quality check failed — you can still submit");
    } finally {
      setPreflightLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <div className="bg-card border border-border rounded-2xl w-full max-w-3xl shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-border">
          <div>
            <h2 className="text-sm font-semibold text-foreground">New request</h2>
            <p className="text-xs text-muted-foreground mt-0.5">AI will triage after you submit</p>
          </div>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground text-xl leading-none"
          >
            ×
          </Button>
        </div>

        {/* Form */}
        <form
          ref={formRef}
          onSubmit={handleSubmit}
          onChange={() => { if (preflight || preflightError) { setPreflight(null); setPreflightError(null); setShowIntakeGate(false); setShowJustificationField(false); setIntakeJustification(""); } }}
          className="px-6 py-5"
        >
          <div className="grid grid-cols-2 gap-x-6 gap-y-4">
            {/* Left column */}
            <div className="space-y-4">
              <div>
                <Label className="block text-xs font-medium text-muted-foreground mb-1.5 uppercase tracking-wide">
                  Title <span className="text-accent-danger">*</span>
                </Label>
                <Input
                  name="title"
                  type="text"
                  required
                  autoFocus
                  className="w-full bg-background rounded-lg px-3 py-2.5 h-auto text-sm"
                  placeholder="e.g. Redesign onboarding flow for mobile"
                />
              </div>

              <div>
                <Label className="block text-xs font-medium text-muted-foreground mb-1.5 uppercase tracking-wide">
                  Project <span className="text-accent-danger">*</span>
                </Label>
                <NativeSelect
                  name="projectId"
                  required
                  className="w-full rounded-lg px-3 py-2.5 text-sm"
                >
                  <option value="">Select a project…</option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </NativeSelect>
              </div>

              <div>
                <Label className="block text-xs font-medium text-muted-foreground mb-1.5 uppercase tracking-wide">
                  Description <span className="text-accent-danger">*</span>
                </Label>
                <Textarea
                  name="description"
                  required
                  rows={3}
                  size="lg"
                  className="w-full"
                  placeholder="What needs to be designed? What problem does this solve?"
                />
              </div>

              <div>
                <Label className="block text-xs font-medium text-muted-foreground mb-1.5 uppercase tracking-wide">
                  Business context
                </Label>
                <Textarea
                  name="businessContext"
                  rows={2}
                  size="default"
                  className="w-full"
                  placeholder="Why does this matter? What's the business impact?"
                />
              </div>
            </div>

            {/* Right column */}
            <div className="space-y-4">
              <div>
                <Label className="block text-xs font-medium text-muted-foreground mb-1.5 uppercase tracking-wide">
                  Success metrics
                </Label>
                <Input
                  name="successMetrics"
                  type="text"
                  className="w-full bg-background rounded-lg px-3 py-2.5 h-auto text-sm"
                  placeholder="How will we know it worked?"
                />
              </div>

              <div>
                <Label className="block text-xs font-medium text-muted-foreground mb-1.5 uppercase tracking-wide">
                  Deadline
                </Label>
                <Input
                  name="deadlineAt"
                  type="date"
                  className="w-full bg-background rounded-lg px-3 py-2.5 h-auto text-sm"
                />
              </div>

              <div>
                <Label className="block text-xs font-medium text-muted-foreground mb-1.5 uppercase tracking-wide">
                  Figma link
                </Label>
                <Input
                  name="figmaUrl"
                  type="url"
                  className="w-full bg-background rounded-lg px-3 py-2.5 h-auto text-sm"
                  placeholder="https://figma.com/file/..."
                />
              </div>

              <div className="border border-border rounded-xl p-3 space-y-3 bg-muted">
                <div>
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-0.5">Impact prediction</p>
                  <p className="text-[11px] text-muted-foreground/60">What metric will this move, and by how much?</p>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="block text-xs font-medium text-muted-foreground mb-1">Metric</Label>
                    <Input
                      name="impactMetric"
                      type="text"
                      className="w-full bg-background rounded-lg px-3 py-2 h-auto text-sm"
                      placeholder="e.g. checkout conversion"
                    />
                  </div>
                  <div>
                    <Label className="block text-xs font-medium text-muted-foreground mb-1">Prediction</Label>
                    <Input
                      name="impactPrediction"
                      type="text"
                      className="w-full bg-background rounded-lg px-3 py-2 h-auto text-sm"
                      placeholder="e.g. +5% improvement"
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Intake gate — blocks solution-specific requests */}
          {showIntakeGate && preflight && (preflight.classification === "solution_specific" || preflight.classification === "hybrid") && (
            <div className="mt-4 rounded-xl border border-accent-warning/30 bg-accent-warning/5 p-5 space-y-3">
              <div className="space-y-1">
                <p className="text-sm font-semibold text-foreground">
                  This looks like a solution, not a problem
                </p>
                <p className="text-xs text-muted-foreground">
                  Lane works best when designers understand the <span className="font-medium text-foreground">WHY</span> before the <span className="font-medium text-foreground">WHAT</span>.
                </p>
              </div>

              {preflight.reframedProblem && (
                <div className="space-y-2">
                  <Callout variant="success">
                    <SectionLabel className="font-semibold mb-0.5">Problem detected</SectionLabel>
                    <p className="text-xs text-foreground">{preflight.reframedProblem}</p>
                  </Callout>
                </div>
              )}

              {showJustificationField ? (
                <div className="space-y-2">
                  <Label className="block text-xs font-medium text-muted-foreground">
                    Why are you submitting this as-is?
                  </Label>
                  <Textarea
                    value={intakeJustification}
                    onChange={(e) => setIntakeJustification(e.target.value)}
                    rows={2}
                    size="default"
                    className="w-full"
                    placeholder="Explain why this solution-specific request should proceed..."
                  />
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    disabled={!intakeJustification.trim()}
                    onClick={() => setShowIntakeGate(false)}
                  >
                    Continue with justification
                  </Button>
                </div>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {preflight.reframedProblem && (
                    <Button
                      type="button"
                      variant="default"
                      size="sm"
                      onClick={() => {
                        if (formRef.current) {
                          const desc = formRef.current.querySelector<HTMLTextAreaElement>("textarea[name=description]");
                          if (desc) desc.value = preflight.reframedProblem!;
                        }
                        setShowIntakeGate(false);
                        setPreflight(null);
                      }}
                    >
                      Accept AI rewrite
                    </Button>
                  )}
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                      setShowIntakeGate(false);
                      setPreflight(null);
                      formRef.current?.querySelector<HTMLTextAreaElement>("textarea[name=description]")?.focus();
                    }}
                  >
                    Edit myself
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowJustificationField(true)}
                  >
                    Submit anyway
                  </Button>
                </div>
              )}
            </div>
          )}

          {/* Pre-flight results panel */}
          {(preflight || preflightError) && (
            <div className="mt-4 rounded-xl border border-border p-4 space-y-3 bg-muted">
              {preflightError ? (
                <p className="text-xs text-accent-danger">{preflightError}</p>
              ) : preflight && (
                <>
                  {/* Score */}
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-muted-foreground">Quality score</span>
                    <Badge
                      variant="outline"
                      className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                        preflight.qualityScore >= 80
                          ? "bg-primary/10 text-primary"
                          : preflight.qualityScore >= 50
                          ? "bg-[var(--accent-warning)]/10 text-[var(--accent-warning)]"
                          : "bg-destructive/10 text-destructive"
                      }`}
                    >
                      {preflight.qualityScore}/100
                    </Badge>
                    <span className="text-xs text-muted-foreground/60">
                      {preflight.qualityScore >= 80
                        ? "Good to go"
                        : preflight.qualityScore >= 50
                        ? "Could be stronger"
                        : "Needs more detail"}
                    </span>
                  </div>

                  {/* Flags */}
                  {preflight.qualityFlags.length > 0 && (
                    <div>
                      <SectionLabel className="font-semibold mb-1">Issues</SectionLabel>
                      <ul className="space-y-0.5">
                        {preflight.qualityFlags.map((flag, i) => (
                          <li key={i} className="text-xs text-muted-foreground flex items-start gap-1.5">
                            <span className="text-accent-danger mt-0.5">·</span>
                            {flag}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Suggestions */}
                  {preflight.suggestions.length > 0 && (
                    <div>
                      <SectionLabel className="font-semibold mb-1">Suggestions</SectionLabel>
                      <ol className="space-y-0.5 list-none">
                        {preflight.suggestions.map((s, i) => (
                          <li key={i} className="text-xs text-muted-foreground flex items-start gap-1.5">
                            <span className="font-mono text-muted-foreground/60">{i + 1}.</span>
                            {s}
                          </li>
                        ))}
                      </ol>
                    </div>
                  )}

                  {/* Duplicates */}
                  {preflight.potentialDuplicates.length > 0 && (
                    <div>
                      <SectionLabel className="font-semibold mb-1">Possible duplicates</SectionLabel>
                      <ul className="space-y-1">
                        {preflight.potentialDuplicates.map((d) => (
                          <li key={d.id} className="text-xs text-muted-foreground">
                            <span className="font-medium text-foreground">{d.title}</span>
                            <span className="text-muted-foreground/60"> — {d.reason}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {error && (
            <Callout variant="error" className="mt-3">{error}</Callout>
          )}

          <div className="flex items-center justify-end gap-3 pt-3">
            <Button
              type="button"
              variant="ghost"
              onClick={onClose}
              className="text-sm text-muted-foreground"
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={handlePreflight}
              disabled={preflightLoading}
              className="text-sm"
            >
              {preflightLoading ? (
                <>
                  <span className="inline-block w-3 h-3 border-2 border-t-primary rounded-full animate-spin" />
                  Checking…
                </>
              ) : (
                "Check quality"
              )}
            </Button>
            <Button
              type="submit"
              variant="default"
              disabled={loading || showIntakeGate}
              className="text-sm px-5"
            >
              {loading ? (
                <>
                  <span className="inline-block w-3.5 h-3.5 border-2 border-primary-foreground/40 border-t-primary-foreground rounded-full animate-spin" />
                  Triaging…
                </>
              ) : (
                "Submit & triage"
              )}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
