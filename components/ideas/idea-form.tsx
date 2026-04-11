"use client";

import { useState } from "react";
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
import { Checkbox } from "@/components/ui/checkbox";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Alert, AlertDescription } from "@/components/ui/alert";

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
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Submit an idea</DialogTitle>
          <DialogDescription>
            Share your idea with the org. Anyone can vote during the 1-week voting period.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Title */}
          <div className="space-y-1.5">
            <Label htmlFor="idea-title">Idea title *</Label>
            <Input
              id="idea-title"
              value={form.title}
              onChange={(e) => set("title", e.target.value)}
              placeholder="Short, descriptive name"
            />
          </div>

          {/* Problem */}
          <div className="space-y-1.5">
            <Label htmlFor="idea-problem">What problem does this solve? *</Label>
            <Textarea
              id="idea-problem"
              value={form.problem}
              onChange={(e) => set("problem", e.target.value)}
              rows={3}
              placeholder="Describe the problem clearly..."
            />
          </div>

          {/* Proposed solution */}
          <div className="space-y-1.5">
            <Label htmlFor="idea-solution">Proposed solution *</Label>
            <Textarea
              id="idea-solution"
              value={form.proposedSolution}
              onChange={(e) => set("proposedSolution", e.target.value)}
              rows={3}
              placeholder="How would you solve it?"
            />
          </div>

          {/* Category + Effort row */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="idea-category">Category</Label>
              <NativeSelect
                id="idea-category"
                value={form.category}
                onChange={(e) => set("category", e.target.value)}
                className="w-full"
              >
                {CATEGORIES.map((c) => (
                  <NativeSelectOption key={c.value} value={c.value}>{c.label}</NativeSelectOption>
                ))}
              </NativeSelect>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="idea-effort">Effort estimate (weeks)</Label>
              <Input
                id="idea-effort"
                type="number"
                min={1}
                value={form.effortEstimateWeeks}
                onChange={(e) => set("effortEstimateWeeks", e.target.value)}
                placeholder="e.g. 2"
              />
            </div>
          </div>

          {/* Impact estimate */}
          <div className="space-y-1.5">
            <Label htmlFor="idea-impact">Expected impact</Label>
            <Input
              id="idea-impact"
              value={form.impactEstimate}
              onChange={(e) => set("impactEstimate", e.target.value)}
              placeholder="e.g. Reduce onboarding drop-off by 20%"
            />
          </div>

          {/* Target users */}
          <div className="space-y-1.5">
            <Label htmlFor="idea-users">Target users</Label>
            <Input
              id="idea-users"
              value={form.targetUsers}
              onChange={(e) => set("targetUsers", e.target.value)}
              placeholder="e.g. New users in onboarding flow"
            />
          </div>

          {/* Anonymous toggle */}
          <div className="flex items-center gap-2.5">
            <Checkbox
              id="idea-anonymous"
              checked={form.isAnonymous}
              onCheckedChange={(checked) => set("isAnonymous", !!checked)}
            />
            <Label htmlFor="idea-anonymous" className="font-normal text-muted-foreground">
              Submit anonymously
            </Label>
          </div>

          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? "Submitting..." : "Submit idea"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
