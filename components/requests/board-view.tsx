"use client";

import type { Request } from "@/db/schema";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";

interface BoardColumn {
  key: string;
  label: string;
}

interface BoardViewProps {
  requests: Request[];
  columns: BoardColumn[];
  getColumnKey: (request: Request) => string;
  projectMap: Record<string, { name: string; color: string }>;
  onRequestClick: (request: Request) => void;
}

function PriorityBadge({ priority }: { priority: string | null }) {
  if (!priority) return null;
  return (
    <Badge
      variant="outline"
      className="shrink-0 rounded font-mono text-[9px] font-bold uppercase tracking-wide px-1.5 py-px"
      style={{
        background: `var(--priority-${priority}-bg)`,
        color: `var(--priority-${priority}-text)`,
      }}
    >
      {priority.toUpperCase()}
    </Badge>
  );
}

export function BoardView({
  requests,
  columns,
  getColumnKey,
  projectMap,
  onRequestClick,
}: BoardViewProps) {
  // Group requests by column key
  const grouped: Record<string, Request[]> = {};
  for (const col of columns) {
    grouped[col.key] = [];
  }
  for (const r of requests) {
    const key = getColumnKey(r);
    if (grouped[key] !== undefined) {
      grouped[key].push(r);
    } else {
      // If the column key doesn't match any column (shouldn't happen), put in first column
      const firstKey = columns[0]?.key;
      if (firstKey) {
        grouped[firstKey].push(r);
      }
    }
  }

  return (
    <div className="flex gap-3 overflow-x-auto px-5 py-4 h-full items-start">
      {columns.map((col) => {
        const cards = grouped[col.key] ?? [];
        return (
          <div
            key={col.key}
            className="flex flex-col w-60 shrink-0"
          >
            {/* Column header */}
            <div className="flex items-center justify-between mb-2.5">
              <span className="font-mono text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                {col.label}
              </span>
              <span className="font-mono text-[10px] text-muted-foreground/60 bg-muted border border-border rounded px-1.5 py-px">
                {cards.length}
              </span>
            </div>

            {/* Cards */}
            <div
              className={`flex-1 rounded-[10px] bg-muted min-h-20 flex flex-col gap-1.5 ${
                cards.length > 0 ? "p-2" : "p-0"
              }`}
            >
              {cards.length === 0 ? (
                <div className="h-20 border-[1.5px] border-dashed border-border rounded-lg flex items-center justify-center">
                  <span className="font-mono text-[10px] text-muted-foreground/60">
                    Empty
                  </span>
                </div>
              ) : (
                cards.map((r) => {
                  const proj = r.projectId ? projectMap[r.projectId] : null;
                  return (
                    <Card
                      key={r.id}
                      size="sm"
                      className="cursor-pointer text-left transition-colors hover:bg-accent hover:shadow-sm p-0 gap-0"
                      onClick={() => onRequestClick(r)}
                    >
                      <div className="flex flex-col gap-1.5 px-3 py-2.5">
                        <span className="text-xs font-medium text-foreground leading-snug line-clamp-2">
                          {r.title}
                        </span>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <PriorityBadge priority={r.priority} />
                          {proj && (
                            <span className="font-mono text-[9px] text-muted-foreground/60 truncate max-w-[120px]">
                              {proj.name}
                            </span>
                          )}
                        </div>
                      </div>
                    </Card>
                  );
                })
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
