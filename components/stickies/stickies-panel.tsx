"use client";

import { useState, useCallback } from "react";
import { StickyNote } from "lucide-react";
import { StickyCard } from "./sticky-card";
import { updateSticky, archiveSticky } from "@/app/actions/stickies";
import { EmptyState } from "@/components/ui/empty-state";
import type { Sticky } from "@/db/schema";

type FilterTab = "all" | "pinned" | "linked";

const TABS: { key: FilterTab; label: string }[] = [
  { key: "all", label: "All" },
  { key: "pinned", label: "Pinned" },
  { key: "linked", label: "Linked" },
];

interface StickiesPanelProps {
  stickies: Sticky[];
}

export function StickiesPanel({ stickies: initial }: StickiesPanelProps) {
  const [stickiesList, setStickiesList] = useState(initial);
  const [activeTab, setActiveTab] = useState<FilterTab>("all");

  const filtered = stickiesList.filter((s) => {
    if (activeTab === "pinned") return s.isPinned;
    if (activeTab === "linked") return s.requestId !== null;
    return true;
  });

  const handleUpdate = useCallback(
    async (
      id: string,
      data: { content?: string; color?: string; isPinned?: boolean }
    ) => {
      // Optimistic update
      setStickiesList((prev) =>
        prev.map((s) => (s.id === id ? { ...s, ...data } : s))
      );
      await updateSticky(id, data);
    },
    []
  );

  const handleArchive = useCallback(async (id: string) => {
    // Optimistic removal
    setStickiesList((prev) => prev.filter((s) => s.id !== id));
    await archiveSticky(id);
  }, []);

  return (
    <div>
      {/* Filter tabs */}
      <div
        style={{
          display: "flex",
          gap: 4,
          marginBottom: 16,
        }}
      >
        {TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setActiveTab(tab.key)}
            className={activeTab === tab.key ? "text-primary bg-primary/10" : "text-muted-foreground"}
            style={{
              fontSize: 13,
              fontWeight: activeTab === tab.key ? 560 : 440,
              background: activeTab === tab.key ? undefined : "transparent",
              border: "none",
              cursor: "pointer",
              padding: "5px 12px",
              borderRadius: 6,
              transition: "all 0.15s ease",
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Grid or empty state */}
      {filtered.length === 0 ? (
        <EmptyState
          icon={StickyNote}
          title="A place for fleeting thoughts."
          subtitle="Press N then S to start."
        />
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
            gap: 16,
          }}
        >
          {filtered.map((s) => (
            <StickyCard
              key={s.id}
              sticky={s}
              onUpdate={handleUpdate}
              onArchive={handleArchive}
            />
          ))}
        </div>
      )}
    </div>
  );
}
