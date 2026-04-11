import type { PublishedView, Request, Phase } from "@/db/schema";
import { getPhaseLabel, getStageLabel } from "@/lib/workflow";

const PRIORITY_LABELS: Record<string, string> = {
  p0: "P0",
  p1: "P1",
  p2: "P2",
  p3: "P3",
};

function getStage(r: Request): string {
  if (r.phase === "predesign") return getStageLabel(r.predesignStage ?? "intake");
  if (r.phase === "design") return getStageLabel(r.designStage ?? "sense");
  if (r.phase === "dev") return getStageLabel(r.kanbanState ?? "todo");
  if (r.phase === "track") return getStageLabel(r.trackStage ?? "measuring");
  return "";
}

interface Props {
  view: PublishedView;
  requests: Request[];
  isPublic: boolean;
}

export function PublishedViewPage({ view, requests, isPublic }: Props) {
  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#F8F6F1",
        fontFamily: "Satoshi, system-ui, sans-serif",
      }}
    >
      {/* Header */}
      <header
        style={{
          borderBottom: "1px solid #E8E4DB",
          padding: "24px 32px",
        }}
      >
        <h1
          style={{
            fontSize: 20,
            fontWeight: 700,
            color: "#1A1A1A",
            marginBottom: 4,
          }}
        >
          {view.name}
        </h1>
        {view.description && (
          <p
            style={{
              fontSize: 14,
              color: "#6B6560",
              lineHeight: 1.5,
            }}
          >
            {view.description}
          </p>
        )}
        <p
          style={{
            fontFamily: "'Geist Mono', monospace",
            fontSize: 10,
            letterSpacing: "0.06em",
            textTransform: "uppercase",
            color: "#A09A93",
            marginTop: 8,
          }}
        >
          {requests.length} request{requests.length !== 1 ? "s" : ""}
          {isPublic ? " \u00B7 Public view" : " \u00B7 Team view"}
        </p>
      </header>

      {/* Table */}
      <main style={{ padding: "16px 32px 48px" }}>
        {requests.length === 0 ? (
          <div
            style={{
              textAlign: "center",
              padding: "64px 0",
              color: "#A09A93",
              fontSize: 14,
            }}
          >
            No requests match the current filters.
          </div>
        ) : (
          <div
            style={{
              border: "1px solid #E8E4DB",
              borderRadius: 12,
              overflow: "hidden",
              background: "#FFFFFF",
            }}
          >
            {/* Table header */}
            <div
              className="grid"
              style={{
                gridTemplateColumns: isPublic
                  ? "1fr 120px 120px 80px"
                  : "1fr 120px 120px 80px",
                padding: "10px 16px",
                background: "#FAF9F6",
                borderBottom: "1px solid #E8E4DB",
                fontFamily: "'Geist Mono', monospace",
                fontSize: 9,
                fontWeight: 500,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                color: "#A09A93",
              }}
            >
              <span>Title</span>
              <span>Phase / Stage</span>
              <span>Priority</span>
              <span>Status</span>
            </div>

            {/* Table rows */}
            {requests.map((r) => (
              <div
                key={r.id}
                className="grid"
                style={{
                  gridTemplateColumns: isPublic
                    ? "1fr 120px 120px 80px"
                    : "1fr 120px 120px 80px",
                  padding: "12px 16px",
                  borderBottom: "1px solid #F0EDE6",
                  alignItems: "center",
                }}
              >
                <span
                  style={{
                    fontSize: 13,
                    fontWeight: 500,
                    color: "#1A1A1A",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {r.title}
                </span>
                <span
                  style={{
                    fontSize: 11,
                    color: "#6B6560",
                  }}
                >
                  {r.phase ? getPhaseLabel(r.phase as Phase) : ""} · {getStage(r)}
                </span>
                <span
                  style={{
                    fontFamily: "'Geist Mono', monospace",
                    fontSize: 10,
                    fontWeight: 600,
                    color: "#6B6560",
                  }}
                >
                  {r.priority ? PRIORITY_LABELS[r.priority] : "\u2014"}
                </span>
                <span
                  style={{
                    fontFamily: "'Geist Mono', monospace",
                    fontSize: 9,
                    textTransform: "uppercase",
                    color: "#A09A93",
                  }}
                >
                  {r.status.replace(/_/g, " ")}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* Comments placeholder */}
        {view.allowComments && !isPublic && (
          <div
            style={{
              marginTop: 24,
              padding: "16px 20px",
              border: "1px solid #E8E4DB",
              borderRadius: 12,
              background: "#FFFFFF",
            }}
          >
            <p
              style={{
                fontFamily: "'Geist Mono', monospace",
                fontSize: 9,
                fontWeight: 500,
                letterSpacing: "0.07em",
                textTransform: "uppercase",
                color: "#A09A93",
                marginBottom: 8,
              }}
            >
              Comments
            </p>
            <p style={{ fontSize: 12, color: "#A09A93" }}>
              Comments will appear here. This feature is coming soon.
            </p>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer
        style={{
          textAlign: "center",
          padding: "16px 32px 32px",
          fontFamily: "'Geist Mono', monospace",
          fontSize: 10,
          letterSpacing: "0.06em",
          color: "#A09A93",
        }}
      >
        Powered by Lane
      </footer>
    </div>
  );
}
