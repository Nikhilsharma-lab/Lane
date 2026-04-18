"use client";

import { useState } from "react";
import { MessageSquare, ExternalLink, ChevronDown, ChevronRight } from "lucide-react";
import { IterationComments } from "./iteration-comments";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { updateIteration } from "@/app/actions/iterations";
import type { Iteration } from "@/db/schema";

interface Props {
  iteration: Iteration;
  commentCount?: number;
}

export function IterationCard({ iteration, commentCount = 0 }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [rationale, setRationale] = useState(iteration.rationale ?? "");
  const [editingRationale, setEditingRationale] = useState(false);
  const [savingRationale, setSavingRationale] = useState(false);

  return (
    <Card className="overflow-hidden">
      <CardContent className="px-4 py-3">
        {/* Title row */}
        <div className="flex items-start justify-between gap-2">
          <p className="text-[13px] font-semibold leading-snug text-foreground">
            {iteration.title}
          </p>

          {iteration.figmaUrl && (
            <Badge
              variant="secondary"
              className="shrink-0 gap-1"
              render={
                <a
                  href={iteration.figmaUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                />
              }
            >
              <ExternalLink size={10} />
              Open in Figma
            </Badge>
          )}
        </div>

        {/* Description */}
        {iteration.description && (
          <p className="mt-1.5 line-clamp-3 text-xs leading-relaxed text-muted-foreground">
            {iteration.description}
          </p>
        )}

        {/* Rationale */}
        <div className="mt-2">
          {editingRationale ? (
            <div className="space-y-1.5">
              <Textarea
                value={rationale}
                onChange={(e) => setRationale(e.target.value)}
                placeholder="Why this direction? What tradeoffs? What are you learning?"
                rows={2}
                className="text-xs resize-none"
                autoFocus
              />
              <div className="flex gap-1.5 justify-end">
                <Button
                  type="button"
                  variant="ghost"
                  size="xs"
                  onClick={() => {
                    setRationale(iteration.rationale ?? "");
                    setEditingRationale(false);
                  }}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  size="xs"
                  disabled={savingRationale}
                  onClick={async () => {
                    setSavingRationale(true);
                    await updateIteration({
                      iterationId: iteration.id,
                      requestId: iteration.requestId,
                      rationale: rationale.trim(),
                    });
                    setEditingRationale(false);
                    setSavingRationale(false);
                  }}
                >
                  {savingRationale ? "Saving..." : "Save"}
                </Button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setEditingRationale(true)}
              className="w-full text-left"
            >
              {iteration.rationale ? (
                <p className="text-xs text-muted-foreground line-clamp-2">
                  <span className="text-[10px] font-medium text-muted-foreground/70 uppercase tracking-wide">
                    Rationale:{" "}
                  </span>
                  {iteration.rationale}
                </p>
              ) : (
                <p className="text-[11px] text-muted-foreground/40 italic">
                  Add rationale — why this direction?
                </p>
              )}
            </button>
          )}
        </div>

        {/* Comment toggle */}
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setExpanded((prev) => !prev)}
          className="mt-3 h-auto p-0 gap-1.5 text-[11px] text-muted-foreground/60 hover:text-muted-foreground"
        >
          {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          <MessageSquare size={11} />
          <span>
            {commentCount} comment{commentCount !== 1 ? "s" : ""}
          </span>
        </Button>
      </CardContent>

      {/* Expanded comments */}
      {expanded && (
        <div className="border-t border-border bg-muted">
          <IterationComments iterationId={iteration.id} />
        </div>
      )}
    </Card>
  );
}
