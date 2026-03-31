"use client";

import { useState, useTransition } from "react";
import { updateRequest } from "@/app/actions/requests";

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
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const form = new FormData(e.currentTarget);

    startTransition(async () => {
      const res = await updateRequest(request.id, {
        title: form.get("title") as string,
        description: form.get("description") as string,
        businessContext: (form.get("businessContext") as string) || null,
        successMetrics: (form.get("successMetrics") as string) || null,
        figmaUrl: (form.get("figmaUrl") as string) || null,
        impactMetric: (form.get("impactMetric") as string) || null,
        impactPrediction: (form.get("impactPrediction") as string) || null,
        deadlineAt: (form.get("deadlineAt") as string) || null,
      });
      if (res.error) {
        setError(res.error);
      } else {
        onClose();
      }
    });
  }

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-lg shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-5 border-b border-zinc-800 sticky top-0 bg-zinc-900">
          <div>
            <h2 className="text-sm font-semibold text-white">Edit request</h2>
            <p className="text-xs text-zinc-500 mt-0.5">Changes are saved immediately</p>
          </div>
          <button onClick={onClose} className="text-zinc-500 hover:text-zinc-300 text-xl leading-none transition-colors">×</button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-5">
          <div>
            <label className="block text-xs font-medium text-zinc-400 mb-1.5 uppercase tracking-wide">
              Title <span className="text-red-400">*</span>
            </label>
            <input
              name="title"
              type="text"
              required
              defaultValue={request.title}
              className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2.5 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-zinc-600 transition-colors"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-zinc-400 mb-1.5 uppercase tracking-wide">
              Description <span className="text-red-400">*</span>
            </label>
            <textarea
              name="description"
              required
              rows={4}
              defaultValue={request.description}
              className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2.5 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-zinc-600 transition-colors resize-none"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-zinc-400 mb-1.5 uppercase tracking-wide">Business context</label>
            <textarea
              name="businessContext"
              rows={2}
              defaultValue={request.businessContext ?? ""}
              className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2.5 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-zinc-600 transition-colors resize-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-zinc-400 mb-1.5 uppercase tracking-wide">Success metrics</label>
              <input
                name="successMetrics"
                type="text"
                defaultValue={request.successMetrics ?? ""}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2.5 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-zinc-600 transition-colors"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-400 mb-1.5 uppercase tracking-wide">Deadline</label>
              <input
                name="deadlineAt"
                type="date"
                defaultValue={toDateInput(request.deadlineAt)}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2.5 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-zinc-600 transition-colors"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-zinc-400 mb-1.5 uppercase tracking-wide">Figma link</label>
            <input
              name="figmaUrl"
              type="url"
              defaultValue={request.figmaUrl ?? ""}
              placeholder="https://figma.com/file/..."
              className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2.5 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-zinc-600 transition-colors"
            />
          </div>

          <div className="border border-zinc-800/60 rounded-xl p-4 space-y-4 bg-zinc-900/30">
            <p className="text-xs font-medium text-zinc-400 uppercase tracking-wide">Impact prediction</p>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-zinc-500 mb-1.5">Metric</label>
                <input
                  name="impactMetric"
                  type="text"
                  defaultValue={request.impactMetric ?? ""}
                  placeholder="e.g. checkout conversion"
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2.5 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-zinc-600 transition-colors"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-zinc-500 mb-1.5">Prediction</label>
                <input
                  name="impactPrediction"
                  type="text"
                  defaultValue={request.impactPrediction ?? ""}
                  placeholder="e.g. +5% improvement"
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2.5 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-zinc-600 transition-colors"
                />
              </div>
            </div>
          </div>

          {error && (
            <p className="text-sm text-red-400 bg-red-950/40 border border-red-900/50 rounded-lg px-3 py-2">{error}</p>
          )}

          <div className="flex items-center justify-end gap-3 pt-1">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-zinc-400 hover:text-white transition-colors">
              Cancel
            </button>
            <button
              type="submit"
              disabled={isPending}
              className="bg-white text-zinc-900 rounded-lg px-5 py-2 text-sm font-medium hover:bg-zinc-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isPending ? "Saving…" : "Save changes"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
