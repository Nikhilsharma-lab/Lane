"use client";

import { useState, useEffect } from "react";

interface ChecklistItem {
  category: "spec" | "accessibility" | "responsive" | "edge_case" | "assets" | "handoff";
  label: string;
  present: boolean;
  note: string | null;
}

const categoryColors: Record<string, string> = {
  spec: "text-[#7DA5C4]",
  accessibility: "text-[#A394C7]",
  responsive: "text-cyan-400",
  edge_case: "text-yellow-400",
  assets: "text-orange-400",
  handoff: "text-green-400",
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
    <section className="border border-[var(--border)] rounded-xl overflow-hidden">
      <button
        onClick={() => (open ? setOpen(false) : load())}
        className="w-full flex items-center justify-between px-5 py-3.5 hover:bg-[var(--bg-subtle)] transition-colors text-left"
      >
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-[var(--text-secondary)] uppercase tracking-wide">
            ✦ AI Handoff Checklist
          </span>
          {items && !loading && (
            <span className={`text-[10px] px-1.5 py-0.5 rounded border font-mono ${
              allDone
                ? "text-green-400 bg-green-500/10 border-green-500/20"
                : missing > 0
                ? "text-yellow-400 bg-yellow-500/10 border-yellow-500/20"
                : "text-[var(--text-secondary)] border-[var(--border)]"
            }`}>
              {allDone ? "Ready" : `${missing} missing`}
            </span>
          )}
        </div>
        <span className="text-[var(--text-tertiary)] text-xs">{open ? "↑" : "↓"}</span>
      </button>

      {open && (
        <div className="border-t border-[var(--border)]">
          {loading ? (
            <div className="flex items-center gap-2.5 px-5 py-6">
              <span className="w-3 h-3 border-2 border-[var(--border-strong)] border-t-[#D4A84B] rounded-full animate-spin" />
              <span className="text-sm text-[var(--text-secondary)]">Checking handoff readiness…</span>
            </div>
          ) : items ? (
            <div className="divide-y divide-[var(--border)]">
              {items.map((item, i) => (
                <label
                  key={i}
                  className="flex items-start gap-3 px-5 py-3 cursor-pointer hover:bg-[var(--bg-subtle)] transition-colors group"
                >
                  <div className="mt-0.5 shrink-0">
                    <input
                      type="checkbox"
                      checked={!!checked[i]}
                      onChange={(e) => setChecked((prev) => ({ ...prev, [i]: e.target.checked }))}
                      className="accent-[var(--accent)] w-3.5 h-3.5"
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className={`text-[9px] uppercase tracking-wide font-medium ${categoryColors[item.category]}`}>
                        {categoryLabels[item.category]}
                      </span>
                      <span className={`text-sm ${checked[i] ? "line-through text-[var(--text-tertiary)]" : "text-[var(--text-primary)]"}`}>
                        {item.label}
                      </span>
                    </div>
                    {item.note && !checked[i] && (
                      <p className="text-xs text-[var(--text-secondary)] mt-0.5">{item.note}</p>
                    )}
                  </div>
                  {!item.present && !checked[i] && (
                    <span className="text-[10px] text-yellow-500/60 shrink-0 mt-0.5">missing</span>
                  )}
                </label>
              ))}
              {allDone && (
                <div className="px-5 py-3 bg-green-500/5">
                  <p className="text-sm text-green-400">✓ All items checked — ready for developer handoff</p>
                </div>
              )}
            </div>
          ) : null}
        </div>
      )}
    </section>
  );
}
