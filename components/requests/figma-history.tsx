"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { FigmaConnectPrompt } from "./figma-connect-prompt";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface FigmaUpdate {
  id: string;
  figmaFileUrl: string;
  figmaFileName: string | null;
  figmaVersionId: string | null;
  figmaUserHandle: string | null;
  changeDescription: string | null;
  updatedAt: string;
  postHandoff: boolean;
  devReviewed: boolean;
  requestPhase: "design" | "dev" | null;
}

interface Props {
  requestId: string;
  phase: string;
  isConnected?: boolean;
  figmaUrl?: string | null;
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

export function FigmaHistory({ requestId, phase, isConnected, figmaUrl }: Props) {
  const router = useRouter();
  const [updates, setUpdates] = useState<FigmaUpdate[]>([]);
  const [loading, setLoading] = useState(true);
  const [reviewing, setReviewing] = useState<string | null>(null);
  const [reviewNotes, setReviewNotes] = useState<Record<string, string>>({});

  const fetchUpdates = useCallback(async () => {
    try {
      const res = await fetch(`/api/requests/${requestId}/figma-updates`);
      const data = await res.json();
      if (res.ok) setUpdates(data.updates ?? []);
    } finally {
      setLoading(false);
    }
  }, [requestId]);

  useEffect(() => {
    if (isConnected) fetchUpdates();
    else setLoading(false);
  }, [fetchUpdates, isConnected]);

  async function markReviewed(updateId: string) {
    setReviewing(updateId);
    try {
      const res = await fetch(
        `/api/requests/${requestId}/figma-updates/${updateId}/review`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ notes: reviewNotes[updateId] ?? "" }),
        }
      );
      if (res.ok) {
        await fetchUpdates();
        router.refresh();
      }
    } finally {
      setReviewing(null);
    }
  }

  if (!isConnected && figmaUrl) {
    return <FigmaConnectPrompt />;
  }

  if (!figmaUrl) return null;

  const unreviewedPostHandoff = updates.filter((u) => u.postHandoff && !u.devReviewed);

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-2">
        <div className="w-3 h-3 border border-border/80 border-t-transparent rounded-full animate-spin" />
        <span className="text-xs text-muted-foreground/60">Loading Figma history...</span>
      </div>
    );
  }

  if (!updates.length) return null;

  return (
    <section>
      <h2 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-3">
        Figma Updates ({updates.length})
      </h2>

      {/* Post-handoff alert */}
      {unreviewedPostHandoff.length > 0 && (
        <div className="mb-3 bg-accent-warning/5 border border-accent-warning/20 rounded-lg px-4 py-3">
          <p className="text-xs text-accent-warning font-medium mb-0.5">
            ⚠️ {unreviewedPostHandoff.length} post-handoff design change{unreviewedPostHandoff.length > 1 ? "s" : ""} need dev review
          </p>
          <p className="text-[11px] text-accent-warning/60">
            The design was updated after handoff — confirm you&apos;ve reviewed before continuing
          </p>
        </div>
      )}

      <div className="space-y-2">
        {updates.map((u) => (
          <div
            key={u.id}
            className={`border rounded-lg overflow-hidden ${
              u.postHandoff && !u.devReviewed
                ? "border-accent-warning/25 bg-accent-warning/3"
                : "border"
            }`}
          >
            <div className="px-4 py-3">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs text-foreground">
                      {u.figmaUserHandle ? `${u.figmaUserHandle}` : "Designer"}
                    </span>
                    {u.postHandoff && (
                      <span className={`text-[10px] px-1.5 py-0.5 rounded border font-medium ${
                        u.devReviewed
                          ? "text-accent-success/70 bg-accent-success/8 border-accent-success/15"
                          : "text-accent-warning bg-accent-warning/10 border-accent-warning/20"
                      }`}>
                        {u.devReviewed ? "reviewed" : "post-handoff"}
                      </span>
                    )}
                    <span className="text-[10px] text-muted-foreground/60 ml-auto shrink-0">{timeAgo(u.updatedAt)}</span>
                  </div>
                  {u.changeDescription && (
                    <p className="text-[11px] text-muted-foreground mt-0.5">{u.changeDescription}</p>
                  )}
                </div>

                <a
                  href={u.figmaFileUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="shrink-0 text-[11px] text-primary hover:text-primary transition-colors"
                >
                  Open ↗
                </a>
              </div>

              {/* Dev review action — only for unreviewed post-handoff during dev phase */}
              {u.postHandoff && !u.devReviewed && phase === "dev" && (
                <div className="mt-2.5 space-y-1.5">
                  <Input
                    type="text"
                    value={reviewNotes[u.id] ?? ""}
                    onChange={(e) =>
                      setReviewNotes((prev) => ({ ...prev, [u.id]: e.target.value }))
                    }
                    placeholder="Review notes (optional)..."
                    inputSize="sm"
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => markReviewed(u.id)}
                    disabled={reviewing === u.id}
                    className="bg-accent-warning/10 hover:bg-accent-warning/20 border-accent-warning/20 text-accent-warning flex items-center gap-1.5"
                  >
                    {reviewing === u.id && (
                      <span className="w-2.5 h-2.5 border border-accent-warning border-t-transparent rounded-full animate-spin" />
                    )}
                    Mark reviewed
                  </Button>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
