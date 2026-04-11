"use client";

import { useState, useCallback } from "react";
import { StickyNote } from "lucide-react";
import { StickyCard } from "./sticky-card";
import { updateSticky, archiveSticky } from "@/app/actions/stickies";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
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
      <div className="mb-4 flex gap-1">
        {TABS.map((tab) => (
          <Button
            key={tab.key}
            variant={activeTab === tab.key ? "secondary" : "ghost"}
            size="sm"
            onClick={() => setActiveTab(tab.key)}
            className={
              activeTab === tab.key
                ? "bg-primary/10 text-primary font-medium"
                : "text-muted-foreground font-normal"
            }
          >
            {tab.label}
          </Button>
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
        <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-4">
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
