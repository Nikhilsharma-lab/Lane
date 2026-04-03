"use client";

import { useEffect } from "react";

const SHORTCUTS = [
  {
    section: "Global",
    items: [
      { key: "⌘K", label: "Command palette" },
      { key: "⌘N", label: "Quick capture" },
      { key: "?", label: "This cheatsheet" },
    ],
  },
  {
    section: "Request List",
    items: [
      { key: "J / K", label: "Navigate requests" },
      { key: "Enter", label: "Open request" },
      { key: "Esc", label: "Close / go back" },
      { key: "/", label: "Focus search" },
    ],
  },
  {
    section: "Request Detail",
    items: [
      { key: "⌘↵", label: "Advance to next stage" },
      { key: "⌘B", label: "Mark blocked / unblock" },
    ],
  },
];

export function KeyboardShortcuts({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" || e.key === "?") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 bg-[var(--text-primary)]/40 backdrop-blur-sm flex items-center justify-center"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm mx-4 bg-[var(--bg-surface)] border border-[var(--border)] rounded-xl shadow-2xl p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-5">
          <p className="text-sm font-medium text-[var(--text-primary)]">Keyboard shortcuts</p>
          <kbd className="text-[10px] text-[var(--text-secondary)] border border-[var(--border)] rounded px-1.5 py-0.5 font-mono bg-[var(--bg-subtle)]">
            Esc
          </kbd>
        </div>

        <div className="space-y-5">
          {SHORTCUTS.map((section) => (
            <div key={section.section}>
              <p className="text-[10px] text-[var(--text-tertiary)] uppercase tracking-wide mb-2">
                {section.section}
              </p>
              <div className="space-y-2">
                {section.items.map((item) => (
                  <div
                    key={item.key}
                    className="flex items-center justify-between"
                  >
                    <span className="text-sm text-[var(--text-secondary)]">{item.label}</span>
                    <kbd className="text-[10px] text-[var(--text-secondary)] border border-[var(--border)] rounded px-1.5 py-0.5 font-mono bg-[var(--bg-subtle)]">
                      {item.key}
                    </kbd>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
