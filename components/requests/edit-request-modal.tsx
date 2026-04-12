"use client";

import { useState, useTransition } from "react";
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
import { Callout } from "@/components/ui/callout";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

interface SerializedRequest {
  id: string;
  title: string;
  description: string;
  businessContext: string | null;
  successMetrics: string | null;
  figmaUrl: string | null;
  impactMetric: string | null;
  impactPrediction: string | null;
  deadlineAt: string | null;
  [key: string]: unknown;
}

interface Props {
  request: SerializedRequest;
  onClose: () => void;
}

function toDateInput(date: Date | string | null): string {
  if (!date) return "";
  return new Date(date).toISOString().split("T")[0];
}

export function EditRequestModal({ request, onClose }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const form = new FormData(e.currentTarget);

    startTransition(async () => {
      const res = await fetch(`/api/requests/${request.id}/update`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: form.get("title") as string,
          description: form.get("description") as string,
          businessContext: (form.get("businessContext") as string) || null,
          successMetrics: (form.get("successMetrics") as string) || null,
          figmaUrl: (form.get("figmaUrl") as string) || null,
          impactMetric: (form.get("impactMetric") as string) || null,
          impactPrediction: (form.get("impactPrediction") as string) || null,
          deadlineAt: (form.get("deadlineAt") as string) || null,
        }),
      });
      const data = await res.json();
      if (data.error) {
        setError(data.error);
      } else {
        router.refresh();
        onClose();
      }
    });
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent size="lg" className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit request</DialogTitle>
          <DialogDescription>Changes are saved immediately</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <Label htmlFor="title" className="uppercase tracking-wide">
              Title <span className="text-accent-danger">*</span>
            </Label>
            <Input
              id="title"
              name="title"
              type="text"
              required
              defaultValue={request.title}
              className="mt-1.5"
            />
          </div>

          <div>
            <Label htmlFor="description" className="uppercase tracking-wide">
              Description <span className="text-accent-danger">*</span>
            </Label>
            <Textarea
              id="description"
              name="description"
              required
              rows={4}
              defaultValue={request.description}
              className="mt-1.5 resize-none"
            />
          </div>

          <div>
            <Label htmlFor="businessContext" className="uppercase tracking-wide">
              Business context
            </Label>
            <Textarea
              id="businessContext"
              name="businessContext"
              rows={2}
              defaultValue={request.businessContext ?? ""}
              className="mt-1.5 resize-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="successMetrics" className="uppercase tracking-wide">
                Success metrics
              </Label>
              <Input
                id="successMetrics"
                name="successMetrics"
                type="text"
                defaultValue={request.successMetrics ?? ""}
                className="mt-1.5"
              />
            </div>
            <div>
              <Label htmlFor="deadlineAt" className="uppercase tracking-wide">
                Deadline
              </Label>
              <Input
                id="deadlineAt"
                name="deadlineAt"
                type="date"
                defaultValue={toDateInput(request.deadlineAt)}
                className="mt-1.5"
              />
            </div>
          </div>

          <div>
            <Label htmlFor="figmaUrl" className="uppercase tracking-wide">
              Figma link
            </Label>
            <Input
              id="figmaUrl"
              name="figmaUrl"
              type="url"
              defaultValue={request.figmaUrl ?? ""}
              placeholder="https://figma.com/file/..."
              className="mt-1.5"
            />
          </div>

          <div className="border rounded-xl p-4 space-y-4 bg-muted">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Impact prediction</p>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="impactMetric">Metric</Label>
                <Input
                  id="impactMetric"
                  name="impactMetric"
                  type="text"
                  defaultValue={request.impactMetric ?? ""}
                  placeholder="e.g. checkout conversion"
                  className="mt-1.5"
                />
              </div>
              <div>
                <Label htmlFor="impactPrediction">Prediction</Label>
                <Input
                  id="impactPrediction"
                  name="impactPrediction"
                  type="text"
                  defaultValue={request.impactPrediction ?? ""}
                  placeholder="e.g. +5% improvement"
                  className="mt-1.5"
                />
              </div>
            </div>
          </div>

          {error && (
            <Callout variant="error">{error}</Callout>
          )}

          <DialogFooter className="pt-1">
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? "Saving\u2026" : "Save changes"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
