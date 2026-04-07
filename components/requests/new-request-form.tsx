"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";

interface Props {
  onClose: () => void;
  projects: { id: string; name: string; color: string }[];
}

interface PreflightResult {
  qualityScore: number;
  qualityFlags: string[];
  suggestions: string[];
  potentialDuplicates: Array<{ id: string; title: string; reason: string }>;
}

export function NewRequestForm({ onClose, projects }: Props) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preflight, setPreflight] = useState<PreflightResult | null>(null);
  const [preflightLoading, setPreflightLoading] = useState(false);
  const [preflightError, setPreflightError] = useState<string | null>(null);

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
    } catch {
      setPreflightError("Quality check failed — you can still submit");
    } finally {
      setPreflightLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <div className="bg-[var(--bg-surface)] border border-[var(--border)] rounded-2xl w-full max-w-3xl shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-[var(--border)]">
          <div>
            <h2 className="text-sm font-semibold text-[var(--text-primary)]">New request</h2>
            <p className="text-xs text-[var(--text-secondary)] mt-0.5">AI will triage after you submit</p>
          </div>
          <button
            onClick={onClose}
            className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] text-xl leading-none transition-colors"
          >
            ×
          </button>
        </div>

        {/* Form */}
        <form
          ref={formRef}
          onSubmit={handleSubmit}
          onChange={() => { if (preflight || preflightError) { setPreflight(null); setPreflightError(null); } }}
          className="px-6 py-5"
        >
          <div className="grid grid-cols-2 gap-x-6 gap-y-4">
            {/* Left column */}
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5 uppercase tracking-wide">
                  Title <span className="text-red-400">*</span>
                </label>
                <input
                  name="title"
                  type="text"
                  required
                  autoFocus
                  className="w-full bg-[var(--bg-base)] border border-[var(--border)] rounded-lg px-3 py-2.5 text-sm text-[var(--text-primary)] placeholder-[var(--text-tertiary)] focus:outline-none focus:border-[var(--border-strong)] transition-colors"
                  placeholder="e.g. Redesign onboarding flow for mobile"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5 uppercase tracking-wide">
                  Project <span className="text-red-400">*</span>
                </label>
                <select
                  name="projectId"
                  required
                  className="w-full bg-[var(--bg-base)] border border-[var(--border)] rounded-lg px-3 py-2.5 text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--border-strong)] transition-colors"
                >
                  <option value="">Select a project…</option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5 uppercase tracking-wide">
                  Description <span className="text-red-400">*</span>
                </label>
                <textarea
                  name="description"
                  required
                  rows={3}
                  className="w-full bg-[var(--bg-base)] border border-[var(--border)] rounded-lg px-3 py-2.5 text-sm text-[var(--text-primary)] placeholder-[var(--text-tertiary)] focus:outline-none focus:border-[var(--border-strong)] transition-colors resize-none"
                  placeholder="What needs to be designed? What problem does this solve?"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5 uppercase tracking-wide">
                  Business context
                </label>
                <textarea
                  name="businessContext"
                  rows={2}
                  className="w-full bg-[var(--bg-base)] border border-[var(--border)] rounded-lg px-3 py-2.5 text-sm text-[var(--text-primary)] placeholder-[var(--text-tertiary)] focus:outline-none focus:border-[var(--border-strong)] transition-colors resize-none"
                  placeholder="Why does this matter? What's the business impact?"
                />
              </div>
            </div>

            {/* Right column */}
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5 uppercase tracking-wide">
                  Success metrics
                </label>
                <input
                  name="successMetrics"
                  type="text"
                  className="w-full bg-[var(--bg-base)] border border-[var(--border)] rounded-lg px-3 py-2.5 text-sm text-[var(--text-primary)] placeholder-[var(--text-tertiary)] focus:outline-none focus:border-[var(--border-strong)] transition-colors"
                  placeholder="How will we know it worked?"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5 uppercase tracking-wide">
                  Deadline
                </label>
                <input
                  name="deadlineAt"
                  type="date"
                  className="w-full bg-[var(--bg-base)] border border-[var(--border)] rounded-lg px-3 py-2.5 text-sm text-[var(--text-primary)] placeholder-[var(--text-tertiary)] focus:outline-none focus:border-[var(--border-strong)] transition-colors"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5 uppercase tracking-wide">
                  Figma link
                </label>
                <input
                  name="figmaUrl"
                  type="url"
                  className="w-full bg-[var(--bg-base)] border border-[var(--border)] rounded-lg px-3 py-2.5 text-sm text-[var(--text-primary)] placeholder-[var(--text-tertiary)] focus:outline-none focus:border-[var(--border-strong)] transition-colors"
                  placeholder="https://figma.com/file/..."
                />
              </div>

              <div className="border border-[var(--border)] rounded-xl p-3 space-y-3 bg-[var(--bg-subtle)]">
                <div>
                  <p className="text-xs font-medium text-[var(--text-secondary)] uppercase tracking-wide mb-0.5">Impact prediction</p>
                  <p className="text-[11px] text-[var(--text-tertiary)]">What metric will this move, and by how much?</p>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">Metric</label>
                    <input
                      name="impactMetric"
                      type="text"
                      className="w-full bg-[var(--bg-base)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--text-primary)] placeholder-[var(--text-tertiary)] focus:outline-none focus:border-[var(--border-strong)] transition-colors"
                      placeholder="e.g. checkout conversion"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">Prediction</label>
                    <input
                      name="impactPrediction"
                      type="text"
                      className="w-full bg-[var(--bg-base)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--text-primary)] placeholder-[var(--text-tertiary)] focus:outline-none focus:border-[var(--border-strong)] transition-colors"
                      placeholder="e.g. +5% improvement"
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Pre-flight results panel */}
          {(preflight || preflightError) && (
            <div
              className="mt-4 rounded-xl border p-4 space-y-3"
              style={{ background: "var(--bg-subtle)", borderColor: "var(--border)" }}
            >
              {preflightError ? (
                <p className="text-xs text-red-400">{preflightError}</p>
              ) : preflight && (
                <>
                  {/* Score */}
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-[var(--text-secondary)]">Quality score</span>
                    <span
                      className="text-xs font-bold px-2 py-0.5 rounded-full"
                      style={{
                        background:
                          preflight.qualityScore >= 80
                            ? "rgba(46,83,57,0.12)"
                            : preflight.qualityScore >= 50
                            ? "rgba(212,168,75,0.12)"
                            : "rgba(239,68,68,0.12)",
                        color:
                          preflight.qualityScore >= 80
                            ? "var(--accent)"
                            : preflight.qualityScore >= 50
                            ? "#D4A84B"
                            : "#ef4444",
                      }}
                    >
                      {preflight.qualityScore}/100
                    </span>
                    <span className="text-xs text-[var(--text-tertiary)]">
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
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--text-tertiary)] mb-1">Issues</p>
                      <ul className="space-y-0.5">
                        {preflight.qualityFlags.map((flag, i) => (
                          <li key={i} className="text-xs text-[var(--text-secondary)] flex items-start gap-1.5">
                            <span className="text-red-400 mt-0.5">·</span>
                            {flag}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Suggestions */}
                  {preflight.suggestions.length > 0 && (
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--text-tertiary)] mb-1">Suggestions</p>
                      <ol className="space-y-0.5 list-none">
                        {preflight.suggestions.map((s, i) => (
                          <li key={i} className="text-xs text-[var(--text-secondary)] flex items-start gap-1.5">
                            <span className="font-mono text-[var(--text-tertiary)]">{i + 1}.</span>
                            {s}
                          </li>
                        ))}
                      </ol>
                    </div>
                  )}

                  {/* Duplicates */}
                  {preflight.potentialDuplicates.length > 0 && (
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--text-tertiary)] mb-1">Possible duplicates</p>
                      <ul className="space-y-1">
                        {preflight.potentialDuplicates.map((d) => (
                          <li key={d.id} className="text-xs text-[var(--text-secondary)]">
                            <span className="font-medium text-[var(--text-primary)]">{d.title}</span>
                            <span className="text-[var(--text-tertiary)]"> — {d.reason}</span>
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
            <p className="mt-3 text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          <div className="flex items-center justify-end gap-3 pt-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handlePreflight}
              disabled={preflightLoading}
              className="px-4 py-2 text-sm font-medium rounded-lg border transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              style={{ borderColor: "var(--border)", color: "var(--text-secondary)", background: "var(--bg-base)" }}
            >
              {preflightLoading ? (
                <>
                  <span className="inline-block w-3 h-3 border-2 border-[var(--border-strong)] border-t-[var(--accent)] rounded-full animate-spin" />
                  Checking…
                </>
              ) : (
                "Check quality"
              )}
            </button>
            <button
              type="submit"
              disabled={loading}
              className="bg-[var(--accent)] text-[var(--accent-text)] rounded-lg px-5 py-2 text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {loading ? (
                <>
                  <span className="inline-block w-3.5 h-3.5 border-2 border-[var(--accent-text)]/40 border-t-[var(--accent-text)] rounded-full animate-spin" />
                  Triaging…
                </>
              ) : (
                "Submit & triage"
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
