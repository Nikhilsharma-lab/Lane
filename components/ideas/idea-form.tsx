"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const CATEGORIES = [
  { value: "design", label: "Design" },
  { value: "feature", label: "Feature" },
  { value: "workflow", label: "Workflow" },
  { value: "performance", label: "Performance" },
  { value: "ux", label: "UX" },
];

interface IdeaFormProps {
  onClose: () => void;
}

export function IdeaForm({ onClose }: IdeaFormProps) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState({
    title: "",
    problem: "",
    proposedSolution: "",
    category: "feature",
    impactEstimate: "",
    effortEstimateWeeks: "",
    targetUsers: "",
    isAnonymous: false,
  });

  function set(key: string, value: string | boolean) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!form.title.trim() || !form.problem.trim() || !form.proposedSolution.trim()) {
      setError("Title, problem, and proposed solution are required.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/ideas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          effortEstimateWeeks: form.effortEstimateWeeks ? parseInt(form.effortEstimateWeeks) : null,
          impactEstimate: form.impactEstimate || null,
          targetUsers: form.targetUsers || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to submit idea");
      } else {
        router.refresh();
        onClose();
      }
    } catch {
      setError("Network error");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--text-primary)]/40 backdrop-blur-sm px-4">
      <div className="w-full max-w-lg bg-[var(--bg-surface)] border border-[var(--border)] rounded-2xl overflow-hidden shadow-2xl">
        {/* Header */}
        <div className="px-6 py-4 border-b border-[var(--border)] flex items-center justify-between">
          <h2 className="text-sm font-semibold text-[var(--text-primary)]">Submit an idea</h2>
          <button
            onClick={onClose}
            className="text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors text-lg leading-none"
          >
            ×
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          {/* Title */}
          <div>
            <label className="text-xs text-[var(--text-secondary)] block mb-1">Idea title *</label>
            <input
              type="text"
              value={form.title}
              onChange={(e) => set("title", e.target.value)}
              placeholder="Short, descriptive name"
              className="w-full bg-[var(--bg-subtle)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--text-primary)] placeholder-[var(--text-tertiary)] focus:outline-none focus:border-[var(--border-strong)] transition-colors"
            />
          </div>

          {/* Problem */}
          <div>
            <label className="text-xs text-[var(--text-secondary)] block mb-1">What problem does this solve? *</label>
            <textarea
              value={form.problem}
              onChange={(e) => set("problem", e.target.value)}
              rows={3}
              placeholder="Describe the problem clearly..."
              className="w-full bg-[var(--bg-subtle)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--text-primary)] placeholder-[var(--text-tertiary)] focus:outline-none focus:border-[var(--border-strong)] transition-colors resize-none"
            />
          </div>

          {/* Proposed solution */}
          <div>
            <label className="text-xs text-[var(--text-secondary)] block mb-1">Proposed solution *</label>
            <textarea
              value={form.proposedSolution}
              onChange={(e) => set("proposedSolution", e.target.value)}
              rows={3}
              placeholder="How would you solve it?"
              className="w-full bg-[var(--bg-subtle)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--text-primary)] placeholder-[var(--text-tertiary)] focus:outline-none focus:border-[var(--border-strong)] transition-colors resize-none"
            />
          </div>

          {/* Category + Effort row */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-[var(--text-secondary)] block mb-1">Category</label>
              <select
                value={form.category}
                onChange={(e) => set("category", e.target.value)}
                className="w-full bg-[var(--bg-subtle)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--border-strong)] transition-colors"
              >
                {CATEGORIES.map((c) => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-[var(--text-secondary)] block mb-1">Effort estimate (weeks)</label>
              <input
                type="number"
                min={1}
                value={form.effortEstimateWeeks}
                onChange={(e) => set("effortEstimateWeeks", e.target.value)}
                placeholder="e.g. 2"
                className="w-full bg-[var(--bg-subtle)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--text-primary)] placeholder-[var(--text-tertiary)] focus:outline-none focus:border-[var(--border-strong)] transition-colors"
              />
            </div>
          </div>

          {/* Impact estimate */}
          <div>
            <label className="text-xs text-[var(--text-secondary)] block mb-1">Expected impact</label>
            <input
              type="text"
              value={form.impactEstimate}
              onChange={(e) => set("impactEstimate", e.target.value)}
              placeholder="e.g. Reduce onboarding drop-off by 20%"
              className="w-full bg-[var(--bg-subtle)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--text-primary)] placeholder-[var(--text-tertiary)] focus:outline-none focus:border-[var(--border-strong)] transition-colors"
            />
          </div>

          {/* Target users */}
          <div>
            <label className="text-xs text-[var(--text-secondary)] block mb-1">Target users</label>
            <input
              type="text"
              value={form.targetUsers}
              onChange={(e) => set("targetUsers", e.target.value)}
              placeholder="e.g. New users in onboarding flow"
              className="w-full bg-[var(--bg-subtle)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--text-primary)] placeholder-[var(--text-tertiary)] focus:outline-none focus:border-[var(--border-strong)] transition-colors"
            />
          </div>

          {/* Anonymous toggle */}
          <label className="flex items-center gap-2.5 cursor-pointer">
            <input
              type="checkbox"
              checked={form.isAnonymous}
              onChange={(e) => set("isAnonymous", e.target.checked)}
              className="w-3.5 h-3.5 rounded border-[var(--border)] bg-[var(--bg-subtle)]"
            />
            <span className="text-xs text-[var(--text-secondary)]">Submit anonymously</span>
          </label>

          {error && (
            <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] px-4 py-2 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="text-xs bg-[var(--accent)] text-[var(--accent-text)] px-4 py-2 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {submitting ? "Submitting..." : "Submit idea"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
