"use client";

import { useState } from "react";
import { MessageSquare, ExternalLink, ChevronDown, ChevronRight } from "lucide-react";
import { IterationComments } from "./iteration-comments";
import type { Iteration } from "@/db/schema";

interface Props {
  iteration: Iteration;
  commentCount?: number;
}

export function IterationCard({ iteration, commentCount = 0 }: Props) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div
      className="rounded-lg overflow-hidden"
      style={{
        border: "1px solid var(--border)",
        background: "var(--bg-surface)",
      }}
    >
      <div className="px-4 py-3">
        {/* Title row */}
        <div className="flex items-start justify-between gap-2">
          <p
            style={{
              fontSize: 13,
              fontWeight: 600,
              color: "var(--text-primary)",
              lineHeight: 1.4,
            }}
          >
            {iteration.title}
          </p>

          {iteration.figmaUrl && (
            <a
              href={iteration.figmaUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="shrink-0 flex items-center gap-1 rounded px-2 py-1 transition-colors"
              style={{
                fontSize: 11,
                fontWeight: 500,
                color: "var(--accent)",
                background: "var(--bg-subtle)",
                textDecoration: "none",
              }}
            >
              <ExternalLink size={10} />
              Open in Figma
            </a>
          )}
        </div>

        {/* Description */}
        {iteration.description && (
          <p
            style={{
              fontSize: 12,
              color: "var(--text-secondary)",
              lineHeight: 1.6,
              marginTop: 6,
              display: "-webkit-box",
              WebkitLineClamp: 3,
              WebkitBoxOrient: "vertical",
              overflow: "hidden",
            }}
          >
            {iteration.description}
          </p>
        )}

        {/* Comment toggle */}
        <button
          onClick={() => setExpanded((prev) => !prev)}
          className="flex items-center gap-1.5 mt-3 transition-colors"
          style={{
            fontSize: 11,
            color: "var(--text-tertiary)",
            background: "none",
            border: "none",
            cursor: "pointer",
            padding: 0,
          }}
        >
          {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          <MessageSquare size={11} />
          <span>
            {commentCount} comment{commentCount !== 1 ? "s" : ""}
          </span>
        </button>
      </div>

      {/* Expanded comments */}
      {expanded && (
        <div
          style={{
            borderTop: "1px solid var(--border)",
            background: "var(--bg-subtle)",
          }}
        >
          <IterationComments iterationId={iteration.id} />
        </div>
      )}
    </div>
  );
}
