"use client";

import type { Request } from "@/db/schema";

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
    <span
      style={{
        display: "inline-block",
        fontFamily: "'Geist Mono', monospace",
        fontSize: 9,
        fontWeight: 700,
        textTransform: "uppercase" as const,
        letterSpacing: "0.04em",
        padding: "1px 5px",
        borderRadius: 3,
        background: `var(--priority-${priority}-bg)`,
        color: `var(--priority-${priority}-text)`,
        flexShrink: 0,
      }}
    >
      {priority.toUpperCase()}
    </span>
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
    <div
      style={{
        display: "flex",
        gap: 12,
        overflowX: "auto",
        padding: "16px 20px",
        height: "100%",
        alignItems: "flex-start",
      }}
    >
      {columns.map((col) => {
        const cards = grouped[col.key] ?? [];
        return (
          <div
            key={col.key}
            style={{ display: "flex", flexDirection: "column", width: 240, flexShrink: 0 }}
          >
            {/* Column header */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: 10,
              }}
            >
              <span
                style={{
                  fontFamily: "'Geist Mono', monospace",
                  fontSize: 10,
                  fontWeight: 600,
                  textTransform: "uppercase",
                  letterSpacing: "0.06em",
                  color: "var(--muted-foreground)",
                }}
              >
                {col.label}
              </span>
              <span
                style={{
                  fontFamily: "'Geist Mono', monospace",
                  fontSize: 10,
                  color: "hsl(var(--muted-foreground) / 0.6)",
                  background: "hsl(var(--muted))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: 4,
                  padding: "1px 6px",
                }}
              >
                {cards.length}
              </span>
            </div>

            {/* Cards */}
            <div
              style={{
                flex: 1,
                borderRadius: 10,
                background: "hsl(var(--muted))",
                minHeight: 80,
                padding: cards.length > 0 ? 8 : 0,
                display: "flex",
                flexDirection: "column",
                gap: 6,
              }}
            >
              {cards.length === 0 ? (
                <div
                  style={{
                    height: 80,
                    border: "1.5px dashed hsl(var(--border))",
                    borderRadius: 8,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <span
                    style={{
                      fontFamily: "'Geist Mono', monospace",
                      fontSize: 10,
                      color: "hsl(var(--muted-foreground) / 0.6)",
                    }}
                  >
                    Empty
                  </span>
                </div>
              ) : (
                cards.map((r) => {
                  const proj = r.projectId ? projectMap[r.projectId] : null;
                  return (
                    <button
                      key={r.id}
                      onClick={() => onRequestClick(r)}
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: 6,
                        padding: "10px 12px",
                        background: "hsl(var(--card))",
                        border: "1px solid hsl(var(--border))",
                        borderRadius: 8,
                        cursor: "pointer",
                        textAlign: "left",
                        transition: "background 0.1s, box-shadow 0.1s",
                      }}
                      className="hover:bg-accent hover:shadow-sm"
                    >
                      <span
                        style={{
                          fontFamily: "'Satoshi', sans-serif",
                          fontSize: 12,
                          fontWeight: 500,
                          color: "hsl(var(--foreground))",
                          lineHeight: 1.4,
                          overflow: "hidden",
                          display: "-webkit-box",
                          WebkitLineClamp: 2,
                          WebkitBoxOrient: "vertical",
                        }}
                      >
                        {r.title}
                      </span>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 6,
                          flexWrap: "wrap",
                        }}
                      >
                        <PriorityBadge priority={r.priority} />
                        {proj && (
                          <span
                            style={{
                              fontFamily: "'Geist Mono', monospace",
                              fontSize: 9,
                              color: "hsl(var(--muted-foreground) / 0.6)",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                              maxWidth: 120,
                            }}
                          >
                            {proj.name}
                          </span>
                        )}
                      </div>
                    </button>
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
