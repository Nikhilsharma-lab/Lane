"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";

type Priority = "p0" | "p1" | "p2" | "p3";

const PRIORITY_LABELS: Record<Priority, string> = {
  p0: "P0",
  p1: "P1",
  p2: "P2",
  p3: "P3",
};

export function QuickCapture({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [businessGoal, setBusinessGoal] = useState("");
  const [priority, setPriority] = useState<Priority>("p2");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const titleRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    titleRef.current?.focus();
  }, []);

  async function submit() {
    const trimmed = title.trim();
    if (!trimmed) return;

    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: trimmed,
          description: businessGoal.trim() || trimmed,
          priority,
        }),
      });
      if (!res.ok) {
        setError("Failed to create request — please try again");
        return;
      }
      router.refresh();
      onClose();
    } finally {
      setSaving(false);
    }
  }

  function onInputKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Escape") { onClose(); return; }
    if (e.key === "Enter") submit();
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-foreground/40 backdrop-blur-sm flex items-start justify-center pt-[22vh]"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md mx-4 bg-card border border-border rounded-xl shadow-2xl p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="text-[10px] text-muted-foreground/60 uppercase tracking-wide mb-4">
          Quick capture
        </p>

        <input
          ref={titleRef}
          value={title}
          onChange={(e) => { setTitle(e.target.value); setError(null); }}
          onKeyDown={onInputKeyDown}
          placeholder="What needs to be designed?"
          className="w-full bg-transparent text-foreground text-sm placeholder:text-muted-foreground/60 outline-none pb-3 mb-3 border-b border-border focus:border-border transition-colors"
        />

        <input
          value={businessGoal}
          onChange={(e) => setBusinessGoal(e.target.value)}
          onKeyDown={onInputKeyDown}
          placeholder="Business goal (optional)"
          className="w-full bg-transparent text-muted-foreground text-sm placeholder:text-muted-foreground/60 outline-none pb-3 mb-4 border-b border-border focus:border-border transition-colors"
        />

        {error && (
          <p className="text-xs text-red-400 mb-3">{error}</p>
        )}

        <div className="flex items-center justify-between">
          {/* Priority selector */}
          <div className="flex items-center gap-1">
            {(["p0", "p1", "p2", "p3"] as Priority[]).map((p) => (
              <button
                key={p}
                onClick={() => setPriority(p)}
                className={`text-[10px] px-2 py-0.5 rounded border font-mono transition-colors ${
                  priority === p
                    ? "bg-accent border-border text-foreground"
                    : "border-border text-muted-foreground/60 hover:text-muted-foreground"
                }`}
              >
                {PRIORITY_LABELS[p]}
              </button>
            ))}
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="text-xs text-muted-foreground/60 hover:text-muted-foreground transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={submit}
              disabled={!title.trim() || saving}
              className="bg-primary text-primary-foreground text-xs px-3 py-1.5 rounded-lg font-medium disabled:opacity-40 transition-opacity"
            >
              {saving ? "Saving…" : "Capture ↵"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
