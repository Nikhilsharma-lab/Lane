"use client";

import { useState } from "react";
import { MessageSquare, ExternalLink, ChevronDown, ChevronRight } from "lucide-react";
import { IterationComments } from "./iteration-comments";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import type { Iteration } from "@/db/schema";

interface Props {
  iteration: Iteration;
  commentCount?: number;
}

export function IterationCard({ iteration, commentCount = 0 }: Props) {
  const [expanded, setExpanded] = useState(false);

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
