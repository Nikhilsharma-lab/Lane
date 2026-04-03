// components/shell/global-pane.tsx
"use client";

import { useRequests } from "@/context/requests-context";

interface Props {
  userId: string;
}

function formatRelative(date: Date | string): string {
  const diff = Date.now() - new Date(date).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

const PHASE_LABELS: Record<string, string> = {
  predesign: "Predesign",
  design: "Design",
  dev: "Dev",
  track: "Track",
};

export function GlobalPane({ userId }: Props) {
  const requests = useRequests();

  const active = requests.filter(
    (r) => !["completed", "shipped"].includes(r.status)
  );

  const overdue = requests.filter((r) => {
    if (!r.deadlineAt) return false;
    return new Date(r.deadlineAt) < new Date() && !["completed", "shipped"].includes(r.status);
  });

  // My work: requests where requesterId matches userId
  const mine = requests.filter((r) => r.requesterId === userId).slice(0, 5);

  const recent = [...requests]
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
    .slice(0, 4);

  return (
    <aside
      className="flex flex-col gap-4 py-5 px-3 shrink-0 overflow-y-auto"
      style={{
        width: "var(--pane-width)",
        background: "var(--bg-subtle)",
        borderRight: "1px solid var(--border)",
        height: "100vh",
        position: "sticky",
        top: 0,
      }}
    >
      {/* Stats */}
      <div>
        <p
          className="mb-2"
          style={{
            fontFamily: "'Geist Mono', monospace",
            fontSize: 9,
            fontWeight: 500,
            letterSpacing: "0.07em",
            textTransform: "uppercase",
            color: "var(--text-tertiary)",
          }}
        >
          Overview
        </p>
        <div className="flex gap-2">
          <div
            className="flex-1 rounded-lg p-3"
            style={{ background: "var(--bg-surface)", border: "1px solid var(--border)" }}
          >
            <p style={{ fontSize: 22, fontWeight: 700, color: "var(--text-primary)", lineHeight: 1 }}>
              {active.length}
            </p>
            <p style={{ fontSize: 10, color: "var(--text-tertiary)", marginTop: 3 }}>Active</p>
          </div>
          <div
            className="flex-1 rounded-lg p-3"
            style={{ background: "var(--bg-surface)", border: "1px solid var(--border)" }}
          >
            <p
              style={{
                fontSize: 22,
                fontWeight: 700,
                color: overdue.length > 0 ? "#B45309" : "var(--text-primary)",
                lineHeight: 1,
              }}
            >
              {overdue.length}
            </p>
            <p style={{ fontSize: 10, color: "var(--text-tertiary)", marginTop: 3 }}>Overdue</p>
          </div>
        </div>
      </div>

      {/* My Work */}
      {mine.length > 0 && (
        <div>
          <p
            className="mb-2"
            style={{
              fontFamily: "'Geist Mono', monospace",
              fontSize: 9,
              fontWeight: 500,
              letterSpacing: "0.07em",
              textTransform: "uppercase",
              color: "var(--text-tertiary)",
            }}
          >
            My Work
          </p>
          <div className="flex flex-col gap-1.5">
            {mine.map((r) => (
              <div
                key={r.id}
                className="rounded-md px-2.5 py-2"
                style={{ background: "var(--bg-surface)", border: "1px solid var(--border)" }}
              >
                <p
                  style={{
                    fontFamily: "'Geist Mono', monospace",
                    fontSize: 9,
                    color: "var(--text-tertiary)",
                    marginBottom: 2,
                  }}
                >
                  #{r.id.slice(0, 6).toUpperCase()}
                </p>
                <p
                  style={{
                    fontSize: 11,
                    color: "var(--text-primary)",
                    fontWeight: 500,
                    lineHeight: 1.3,
                    overflow: "hidden",
                    display: "-webkit-box",
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: "vertical",
                  }}
                >
                  {r.title}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recent Activity */}
      <div>
        <p
          className="mb-2"
          style={{
            fontFamily: "'Geist Mono', monospace",
            fontSize: 9,
            fontWeight: 500,
            letterSpacing: "0.07em",
            textTransform: "uppercase",
            color: "var(--text-tertiary)",
          }}
        >
          Recent
        </p>
        <div className="flex flex-col gap-1.5">
          {recent.map((r) => (
            <div key={r.id} className="flex flex-col gap-0.5">
              <p style={{ fontSize: 11, color: "var(--text-secondary)", fontWeight: 500, lineHeight: 1.3 }}>
                {r.title.length > 32 ? r.title.slice(0, 32) + "…" : r.title}
              </p>
              <p
                style={{
                  fontFamily: "'Geist Mono', monospace",
                  fontSize: 9,
                  color: "var(--text-tertiary)",
                }}
              >
                {PHASE_LABELS[r.phase ?? "predesign"]} · {formatRelative(r.updatedAt)}
              </p>
            </div>
          ))}
        </div>
      </div>
    </aside>
  );
}
