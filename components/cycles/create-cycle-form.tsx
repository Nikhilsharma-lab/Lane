"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createCycle } from "@/app/actions/cycles";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";

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
      <Button
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
      >
        + Create Cycle
      </Button>
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
            <NativeSelect
              name="projectId"
              required
              className="w-full"
            >
              <option value="">Select project...</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </NativeSelect>
          </div>

          <div>
            <label className="text-xs text-muted-foreground block mb-1">
              Cycle Name
            </label>
            <Input
              name="name"
              type="text"
              required
              placeholder="e.g. Q2 Sprint 1"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted-foreground block mb-1">
                Appetite (weeks)
              </label>
              <Input
                name="appetiteWeeks"
                type="number"
                min={1}
                max={52}
                defaultValue={6}
                required
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground block mb-1">
                Starts
              </label>
              <Input
                name="startsAt"
                type="date"
                required
                defaultValue={new Date().toISOString().slice(0, 10)}
              />
            </div>
          </div>

          {error && (
            <p className="text-xs text-accent-danger">{error}</p>
          )}

          <div className="flex items-center justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setOpen(false);
                setError(null);
              }}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={loading}
            >
              {loading ? "Creating..." : "Create"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
