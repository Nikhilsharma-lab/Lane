"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createInitiative } from "@/app/actions/initiatives";

const INITIATIVE_COLORS = [
  "#2E5339",
  "#A394C7",
  "#7DA5C4",
  "#D4A84B",
  "#86A87A",
  "#E07070",
  "#71717a",
];

export function CreateInitiativeForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedColor, setSelectedColor] = useState(INITIATIVE_COLORS[0]);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const form = new FormData(e.currentTarget);
    const result = await createInitiative({
      name: (form.get("name") as string) ?? "",
      description: (form.get("description") as string) || undefined,
      color: selectedColor,
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
        + Create Initiative
      </button>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-card border border rounded-xl p-6 w-full max-w-md shadow-xl">
        <h2 className="text-sm font-semibold text-foreground mb-4">
          Create Initiative
        </h2>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-xs text-muted-foreground block mb-1">
              Name
            </label>
            <input
              name="name"
              type="text"
              required
              placeholder="e.g. Checkout Redesign"
              className="w-full text-sm bg-card border border rounded-lg px-3 py-2 text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:border-primary"
            />
          </div>

          <div>
            <label className="text-xs text-muted-foreground block mb-1">
              Description
            </label>
            <textarea
              name="description"
              rows={3}
              placeholder="What is this initiative about?"
              className="w-full text-sm bg-[var(--bg-surface)] border border-[var(--border)] rounded-lg px-3 py-2 text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none focus:border-[var(--accent)] resize-none"
            />
          </div>

          <div>
            <label className="text-xs text-muted-foreground block mb-1">
              Color
            </label>
            <div className="flex items-center gap-2">
              {INITIATIVE_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setSelectedColor(c)}
                  className="w-6 h-6 rounded-full border-2 transition-all"
                  style={{
                    background: c,
                    borderColor:
                      selectedColor === c ? "hsl(var(--foreground))" : "transparent",
                    transform: selectedColor === c ? "scale(1.15)" : "scale(1)",
                  }}
                />
              ))}
            </div>
          </div>

          {error && <p className="text-xs text-red-500">{error}</p>}

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
