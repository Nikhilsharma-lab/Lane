"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

interface AiScores {
  impactScore: number;
  effortEstimate: number;
  feasibilityScore: number;
  roiScore: number;
  reasoning: string;
}

interface IdeaValidationPanelProps {
  ideaId: string;
  ideaTitle: string;
  onClose: () => void;
}

function ScoreBar({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-[11px] text-muted-foreground">{label}</span>
        <span className={`text-[11px] font-mono font-semibold ${color}`}>{value}/10</span>
      </div>
      <div className="w-full h-1.5 bg-accent rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full ${value >= 7 ? "bg-green-500" : value >= 4 ? "bg-yellow-500" : "bg-red-500"}`}
          style={{ width: `${value * 10}%` }}
        />
      </div>
    </div>
  );
}

export function IdeaValidationPanel({ ideaId, ideaTitle, onClose }: IdeaValidationPanelProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aiScores, setAiScores] = useState<AiScores | null>(null);

  const [overrides, setOverrides] = useState({
    impactScore: "",
    effortEstimate: "",
    feasibilityScore: "",
    roiScore: "",
  });
  const [decision, setDecision] = useState<"approved" | "approved_with_conditions" | "rejected">("approved");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    async function fetchScores() {
      try {
        const res = await fetch(`/api/ideas/${ideaId}/validate`);
        const data = await res.json();
        if (res.ok) {
          setAiScores(data);
          setNotes(data.reasoning);
        } else {
          setError(data.error ?? "Failed to load AI scores");
        }
      } catch {
        setError("Failed to load AI scores");
      } finally {
        setLoading(false);
      }
    }
    fetchScores();
  }, [ideaId]);

  async function handleSubmit() {
    if (!decision) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/ideas/${ideaId}/validate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          decision,
          notes,
          impactScoreOverride: overrides.impactScore ? parseInt(overrides.impactScore) : undefined,
          effortEstimateOverride: overrides.effortEstimate ? parseInt(overrides.effortEstimate) : undefined,
          feasibilityScoreOverride: overrides.feasibilityScore ? parseInt(overrides.feasibilityScore) : undefined,
          roiScoreOverride: overrides.roiScore ? parseInt(overrides.roiScore) : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Validation failed");
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/40 backdrop-blur-sm px-4">
      <div className="w-full max-w-lg bg-card border rounded-2xl overflow-hidden shadow-2xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="px-6 py-4 border-b border flex items-center justify-between sticky top-0 bg-card">
          <div>
            <h2 className="text-sm font-semibold text-foreground">Validate idea</h2>
            <p className="text-xs text-muted-foreground/60 mt-0.5 truncate max-w-xs">{ideaTitle}</p>
          </div>
          <button
            onClick={onClose}
            className="text-muted-foreground/60 hover:text-foreground transition-colors text-lg leading-none"
          >
            ×
          </button>
        </div>

        <div className="px-6 py-5 space-y-5">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <div className="w-5 h-5 border border-border/80 border-t-transparent rounded-full animate-spin" />
              <span className="text-xs text-muted-foreground ml-3">Running AI analysis...</span>
            </div>
          ) : error && !aiScores ? (
            <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{error}</p>
          ) : aiScores ? (
            <>
              {/* AI Scores */}
              <div className="border rounded-xl p-4 space-y-3">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">AI Analysis</span>
                  <span className="text-[10px] text-muted-foreground/60">· claude-3-5-haiku</span>
                </div>
                <ScoreBar label="Impact" value={aiScores.impactScore} color={aiScores.impactScore >= 7 ? "text-green-400" : aiScores.impactScore >= 4 ? "text-yellow-400" : "text-red-400"} />
                <ScoreBar label="Effort" value={aiScores.effortEstimate} color={aiScores.effortEstimate <= 4 ? "text-green-400" : aiScores.effortEstimate <= 7 ? "text-yellow-400" : "text-red-400"} />
                <ScoreBar label="Feasibility" value={aiScores.feasibilityScore} color={aiScores.feasibilityScore >= 7 ? "text-green-400" : aiScores.feasibilityScore >= 4 ? "text-yellow-400" : "text-red-400"} />
                <ScoreBar label="ROI" value={aiScores.roiScore} color={aiScores.roiScore >= 7 ? "text-green-400" : aiScores.roiScore >= 4 ? "text-yellow-400" : "text-red-400"} />
                <p className="text-[11px] text-muted-foreground leading-relaxed pt-1">{aiScores.reasoning}</p>
              </div>

              {/* Score overrides */}
              <div>
                <p className="text-xs text-muted-foreground mb-2">Override scores (optional)</p>
                <div className="grid grid-cols-4 gap-2">
                  {(["impactScore", "effortEstimate", "feasibilityScore", "roiScore"] as const).map((key) => {
                    const labels: Record<string, string> = {
                      impactScore: "Impact",
                      effortEstimate: "Effort",
                      feasibilityScore: "Feasibility",
                      roiScore: "ROI",
                    };
                    return (
                      <div key={key}>
                        <label className="text-[10px] text-muted-foreground/60 block mb-1">{labels[key]}</label>
                        <input
                          type="number"
                          min={1}
                          max={10}
                          value={overrides[key]}
                          onChange={(e) => setOverrides((o) => ({ ...o, [key]: e.target.value }))}
                          placeholder={String(aiScores[key])}
                          className="w-full bg-muted border border rounded px-2 py-1 text-xs text-foreground placeholder-muted-foreground/60 focus:outline-none focus:border-border/80 transition-colors"
                        />
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Notes */}
              <div>
                <label className="text-xs text-muted-foreground block mb-1">Notes</label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={3}
                  className="w-full bg-muted border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-border/80 transition-colors resize-none"
                />
              </div>

              {/* Decision */}
              <div>
                <p className="text-xs text-muted-foreground mb-2">Decision</p>
                <div className="flex gap-2">
                  {(["approved", "approved_with_conditions", "rejected"] as const).map((d) => {
                    const labels = {
                      approved: "Approve",
                      approved_with_conditions: "Approve with conditions",
                      rejected: "Reject",
                    };
                    const styles = {
                      approved: decision === d ? "bg-green-500/15 border-green-500/30 text-green-400" : "border text-muted-foreground hover:text-foreground",
                      approved_with_conditions: decision === d ? "bg-amber-500/15 border-amber-500/30 text-amber-400" : "border text-muted-foreground hover:text-foreground",
                      rejected: decision === d ? "bg-red-500/15 border-red-500/30 text-red-400" : "border text-muted-foreground hover:text-foreground",
                    };
                    return (
                      <button
                        key={d}
                        onClick={() => setDecision(d)}
                        className={`text-xs border rounded-lg px-3 py-1.5 transition-colors ${styles[d]}`}
                      >
                        {labels[d]}
                      </button>
                    );
                  })}
                </div>
              </div>

              {decision === "approved" && (
                <div className="bg-green-500/5 border border-green-500/15 rounded-lg px-3 py-2.5">
                  <p className="text-[11px] text-green-400/80">
                    Approving will auto-create a request in PREDESIGN phase and link it to this idea.
                  </p>
                </div>
              )}

              {error && (
                <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{error}</p>
              )}

              <div className="flex justify-end gap-2 pt-1">
                <button
                  onClick={onClose}
                  className="text-xs text-muted-foreground hover:text-foreground px-4 py-2 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSubmit}
                  disabled={submitting}
                  className={`text-xs px-4 py-2 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                    decision === "rejected"
                      ? "bg-red-600 hover:bg-red-500 text-white"
                      : "bg-primary text-primary-foreground"
                  }`}
                >
                  {submitting ? "Submitting..." : decision === "rejected" ? "Reject idea" : "Approve idea"}
                </button>
              </div>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
