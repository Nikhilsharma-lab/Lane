"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createInitiative } from "@/app/actions/initiatives";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

const INITIATIVE_COLORS = [
  "var(--accent-success)",
  "var(--phase-design)",
  "var(--phase-dev)",
  "var(--phase-predesign)",
  "var(--phase-track)",
  "var(--accent-danger)",
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
      <Button
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
      >
        + Create Initiative
      </Button>
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
            <Input
              name="name"
              type="text"
              required
              placeholder="e.g. Checkout Redesign"
            />
          </div>

          <div>
            <label className="text-xs text-muted-foreground block mb-1">
              Description
            </label>
            <Textarea
              name="description"
              rows={3}
              placeholder="What is this initiative about?"
              className="resize-none"
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

          {error && <p className="text-xs text-accent-danger">{error}</p>}

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
              variant="default"
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
