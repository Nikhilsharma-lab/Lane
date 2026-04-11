"use client";

import { useEffect, useState } from "react";
import { ActivityEntry } from "./activity-entry";
import { EmptyState } from "@/components/ui/empty-state";
import { Activity } from "lucide-react";

interface TimelineEntry {
  id: string;
  requestId: string;
  actorId: string | null;
  actorName: string | null;
  action: string;
  field: string | null;
  oldValue: string | null;
  newValue: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export function ActivityTimeline({ requestId }: { requestId: string }) {
  const [entries, setEntries] = useState<TimelineEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    fetch(`/api/requests/${requestId}/activity`)
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled) setEntries(data.entries ?? []);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [requestId]);

  if (loading) {
    return (
      <p className="text-xs text-muted-foreground/60 p-4">
        Loading timeline...
      </p>
    );
  }

  if (entries.length === 0) {
    return (
      <EmptyState
        icon={Activity}
        title="No activity yet."
        subtitle="Events will appear here as this request progresses."
      />
    );
  }

  return (
    <div className="flex flex-col">
      {entries.map((entry) => (
        <ActivityEntry key={entry.id} entry={entry} />
      ))}
    </div>
  );
}
