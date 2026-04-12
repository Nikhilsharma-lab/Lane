"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";

interface ChecklistItem {
  category: "spec" | "accessibility" | "responsive" | "edge_case" | "assets" | "handoff";
  label: string;
  present: boolean;
  note: string | null;
}

const categoryColors: Record<string, string> = {
  spec: "text-[var(--phase-dev)]",
  accessibility: "text-[var(--phase-design)]",
  responsive: "text-accent-info",
  edge_case: "text-accent-warning",
  assets: "text-accent-warning",
  handoff: "text-accent-success",
};

const categoryLabels: Record<string, string> = {
  spec: "Spec",
  accessibility: "A11y",
  responsive: "Responsive",
  edge_case: "Edge case",
  assets: "Assets",
  handoff: "Handoff",
};

interface Props {
  requestId: string;
  stage: string;
}

export function HandoffChecklist({ requestId, stage }: Props) {
  const [items, setItems] = useState<ChecklistItem[] | null>(null);
  const [checked, setChecked] = useState<Record<number, boolean>>({});
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);

  // Only show for handoff or validate stage
  if (stage !== "handoff" && stage !== "validate") return null;

  async function load() {
    if (items) { setOpen(true); return; }
    setLoading(true);
    setOpen(true);
    try {
      const res = await fetch(`/api/requests/${requestId}/handoff-checklist`);
      const data = await res.json();
      setItems(data.items ?? []);
      // Pre-check items already marked present
      const initial: Record<number, boolean> = {};
      (data.items ?? []).forEach((item: ChecklistItem, i: number) => {
        if (item.present) initial[i] = true;
      });
      setChecked(initial);
    } finally {
      setLoading(false);
    }
  }

  const missing = items?.filter((_, i) => !checked[i]).length ?? 0;
  const total = items?.length ?? 0;
  const allDone = total > 0 && missing === 0;

  return (
    <section className="border rounded-xl overflow-hidden">
      <Button
        variant="ghost"
        onClick={() => (open ? setOpen(false) : load())}
        className="w-full h-auto flex items-center justify-between px-5 py-3.5 rounded-none text-left"
      >
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            ✦ AI Handoff Checklist
          </span>
          {items && !loading && (
            <span className={`text-[10px] px-1.5 py-0.5 rounded border font-mono ${
              allDone
                ? "text-accent-success bg-accent-success/10 border-accent-success/20"
                : missing > 0
                ? "text-accent-warning bg-accent-warning/10 border-accent-warning/20"
                : "text-muted-foreground border"
            }`}>
              {allDone ? "Ready" : `${missing} missing`}
            </span>
          )}
        </div>
        <span className="text-muted-foreground/60 text-xs">{open ? "↑" : "↓"}</span>
      </Button>

      {open && (
        <div className="border-t">
          {loading ? (
            <div className="flex items-center gap-2.5 px-5 py-6">
              <span className="w-3 h-3 border-2 border-border/80 border-t-[var(--accent-active)] rounded-full animate-spin" />
              <span className="text-sm text-muted-foreground">Checking handoff readiness…</span>
            </div>
          ) : items ? (
            <div className="divide-y">
              {items.map((item, i) => (
                <label
                  key={i}
                  className="flex items-start gap-3 px-5 py-3 cursor-pointer hover:bg-muted transition-colors group"
                >
                  <div className="mt-0.5 shrink-0">
                    {/* eslint-disable-next-line no-restricted-syntax -- native checkbox */}
                    <input
                      type="checkbox"
                      checked={!!checked[i]}
                      onChange={(e) => setChecked((prev) => ({ ...prev, [i]: e.target.checked }))}
                      className="accent-primary w-3.5 h-3.5"
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className={`text-[9px] uppercase tracking-wide font-medium ${categoryColors[item.category]}`}>
                        {categoryLabels[item.category]}
                      </span>
                      <span className={`text-sm ${checked[i] ? "line-through text-muted-foreground/60" : "text-foreground"}`}>
                        {item.label}
                      </span>
                    </div>
                    {item.note && !checked[i] && (
                      <p className="text-xs text-muted-foreground mt-0.5">{item.note}</p>
                    )}
                  </div>
                  {!item.present && !checked[i] && (
                    <span className="text-[10px] text-accent-warning/60 shrink-0 mt-0.5">missing</span>
                  )}
                </label>
              ))}
              {allDone && (
                <div className="px-5 py-3 bg-accent-success/5">
                  <p className="text-sm text-accent-success">✓ All items checked — ready for developer handoff</p>
                </div>
              )}
            </div>
          ) : null}
        </div>
      )}
    </section>
  );
}
