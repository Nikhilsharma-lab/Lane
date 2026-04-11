"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createCycle } from "@/app/actions/cycles";

interface Project {
  id: string;
  name: string;
  color: string;
}

interface CreateCycleFormProps {
  projects: Project[];
}

export function CreateCycleForm({ projects }: CreateCycleFormProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const form = new FormData(e.currentTarget);
    const result = await createCycle({
      projectId: form.get("projectId") as string,
      name: (form.get("name") as string) ?? "",
      appetiteWeeks: parseInt(form.get("appetiteWeeks") as string, 10) || 6,
      startsAt: (form.get("startsAt") as string) ?? new Date().toISOString(),
    });

    setLoading(false);

    if (result.error) {
      setError(result.error);
      return;
    }

    setOpen(false);
    router.refresh();
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="text-xs px-3 py-1.5 rounded-lg border border-primary/20 text-primary hover:border-primary/40 transition-colors"
      >
        + Create Cycle
      </button>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-card border border rounded-xl p-6 w-full max-w-md shadow-xl">
        <h2 className="text-sm font-semibold text-foreground mb-4">
          Create Cycle
        </h2>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-xs text-muted-foreground block mb-1">
              Project
            </label>
            <select
              name="projectId"
              required
              className="w-full text-sm bg-card border border rounded-lg px-3 py-2 text-foreground focus:outline-none focus:border-primary"
            >
              <option value="">Select project...</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-xs text-muted-foreground block mb-1">
              Cycle Name
            </label>
            <input
              name="name"
              type="text"
              required
              placeholder="e.g. Q2 Sprint 1"
              className="w-full text-sm bg-card border border rounded-lg px-3 py-2 text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:border-primary"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted-foreground block mb-1">
                Appetite (weeks)
              </label>
              <input
                name="appetiteWeeks"
                type="number"
                min={1}
                max={52}
                defaultValue={6}
                required
                className="w-full text-sm bg-card border border rounded-lg px-3 py-2 text-foreground focus:outline-none focus:border-primary"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground block mb-1">
                Starts
              </label>
              <input
                name="startsAt"
                type="date"
                required
                defaultValue={new Date().toISOString().slice(0, 10)}
                className="w-full text-sm bg-card border border rounded-lg px-3 py-2 text-foreground focus:outline-none focus:border-primary"
              />
            </div>
          </div>

          {error && (
            <p className="text-xs text-red-500">{error}</p>
          )}

          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                setError(null);
              }}
              className="text-xs px-3 py-1.5 rounded-lg border border text-muted-foreground hover:text-foreground transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="text-xs px-3 py-1.5 rounded-lg bg-primary text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              {loading ? "Creating..." : "Create"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
