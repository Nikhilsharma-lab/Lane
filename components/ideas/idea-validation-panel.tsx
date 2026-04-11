"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { Progress, ProgressTrack, ProgressIndicator } from "@/components/ui/progress";

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
          className={`h-full rounded-full transition-all ${value >= 7 ? "bg-green-500" : value >= 4 ? "bg-yellow-500" : "bg-red-500"}`}
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
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Validate idea</DialogTitle>
          <DialogDescription className="truncate max-w-xs">{ideaTitle}</DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <div className="w-5 h-5 border-2 border-border border-t-transparent rounded-full animate-spin" />
              <span className="text-xs text-muted-foreground ml-3">Running AI analysis...</span>
            </div>
          ) : error && !aiScores ? (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : aiScores ? (
            <>
              {/* AI Scores */}
              <Card size="sm">
                <CardHeader>
                  <div className="flex items-center gap-2">
                    <CardTitle className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">AI Analysis</CardTitle>
                    <span className="text-[10px] text-muted-foreground/60 font-mono">claude-3-5-haiku</span>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <ScoreBar label="Impact" value={aiScores.impactScore} color={aiScores.impactScore >= 7 ? "text-green-400" : aiScores.impactScore >= 4 ? "text-yellow-400" : "text-red-400"} />
                  <ScoreBar label="Effort" value={aiScores.effortEstimate} color={aiScores.effortEstimate <= 4 ? "text-green-400" : aiScores.effortEstimate <= 7 ? "text-yellow-400" : "text-red-400"} />
                  <ScoreBar label="Feasibility" value={aiScores.feasibilityScore} color={aiScores.feasibilityScore >= 7 ? "text-green-400" : aiScores.feasibilityScore >= 4 ? "text-yellow-400" : "text-red-400"} />
                  <ScoreBar label="ROI" value={aiScores.roiScore} color={aiScores.roiScore >= 7 ? "text-green-400" : aiScores.roiScore >= 4 ? "text-yellow-400" : "text-red-400"} />
                  <p className="text-[11px] text-muted-foreground leading-relaxed pt-1">{aiScores.reasoning}</p>
                </CardContent>
              </Card>

              {/* Score overrides */}
              <div className="space-y-2">
                <Label className="text-muted-foreground">Override scores (optional)</Label>
                <div className="grid grid-cols-4 gap-2">
                  {(["impactScore", "effortEstimate", "feasibilityScore", "roiScore"] as const).map((key) => {
                    const labels: Record<string, string> = {
                      impactScore: "Impact",
                      effortEstimate: "Effort",
                      feasibilityScore: "Feasibility",
                      roiScore: "ROI",
                    };
                    return (
                      <div key={key} className="space-y-1">
                        <Label className="text-[10px] text-muted-foreground/60 font-normal">{labels[key]}</Label>
                        <Input
                          type="number"
                          min={1}
                          max={10}
                          value={overrides[key]}
                          onChange={(e) => setOverrides((o) => ({ ...o, [key]: e.target.value }))}
                          placeholder={String(aiScores[key])}
                        />
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Notes */}
              <div className="space-y-1.5">
                <Label htmlFor="validation-notes">Notes</Label>
                <Textarea
                  id="validation-notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={3}
                />
              </div>

              {/* Decision */}
              <div className="space-y-2">
                <Label>Decision</Label>
                <div className="flex gap-2">
                  {(["approved", "approved_with_conditions", "rejected"] as const).map((d) => {
                    const labels = {
                      approved: "Approve",
                      approved_with_conditions: "Approve with conditions",
                      rejected: "Reject",
                    };
                    return (
                      <Button
                        key={d}
                        variant="outline"
                        size="sm"
                        onClick={() => setDecision(d)}
                        className={
                          decision === d
                            ? d === "approved"
                              ? "bg-green-500/15 border-green-500/30 text-green-400"
                              : d === "approved_with_conditions"
                              ? "bg-amber-500/15 border-amber-500/30 text-amber-400"
                              : "bg-red-500/15 border-red-500/30 text-red-400"
                            : ""
                        }
                      >
                        {labels[d]}
                      </Button>
                    );
                  })}
                </div>
              </div>

              {decision === "approved" && (
                <Alert>
                  <AlertDescription className="text-green-400/80">
                    Approving will auto-create a request in PREDESIGN phase and link it to this idea.
                  </AlertDescription>
                </Alert>
              )}

              {error && (
                <Alert variant="destructive">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

              <DialogFooter>
                <Button variant="ghost" onClick={onClose}>
                  Cancel
                </Button>
                <Button
                  onClick={handleSubmit}
                  disabled={submitting}
                  variant={decision === "rejected" ? "destructive" : "default"}
                >
                  {submitting ? "Submitting..." : decision === "rejected" ? "Reject idea" : "Approve idea"}
                </Button>
              </DialogFooter>
            </>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
