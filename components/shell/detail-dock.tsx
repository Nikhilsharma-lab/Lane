// components/shell/detail-dock.tsx
"use client";

import React from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { useRequests } from "@/context/requests-context";
import { X } from "lucide-react";

const PHASE_LABELS: Record<string, string> = {
  predesign: "Predesign",
  design: "Design",
  dev: "Dev",
  track: "Track",
};

const STAGE_LABELS: Record<string, string> = {
  intake: "Intake", context: "Context", shape: "Shape", bet: "Betting",
  explore: "Explore", validate: "Validate", handoff: "Handoff",
  todo: "To Do", in_progress: "In Progress", in_review: "In Review", qa: "QA", done: "Done",
  measuring: "Measuring", complete: "Complete",
};

const STATUS_COLORS: Record<string, { bg: string; color: string }> = {
  draft:       { bg: "#F0EDE6", color: "#78716C" },
  submitted:   { bg: "#EAF2EC", color: "#2E5339" },
  triaged:     { bg: "#E0ECF8", color: "#1E6091" },
  assigned:    { bg: "#EAF2EC", color: "#2E5339" },
  in_progress: { bg: "#DBEAFE", color: "#1D4ED8" },
  in_review:   { bg: "#FEF3C7", color: "#B45309" },
  blocked:     { bg: "#FEE2E2", color: "#DC2626" },
  completed:   { bg: "#EAF2EC", color: "#2E5339" },
  shipped:     { bg: "#EAF2EC", color: "#166534" },
};

const PRIORITY_LABELS: Record<string, string> = {
  p0: "P0 · Critical", p1: "P1 · High", p2: "P2 · Medium", p3: "P3 · Low",
};

function formatDate(d: Date | string | null): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

const labelStyle: React.CSSProperties = {
  fontFamily: "'Geist Mono', monospace",
  fontSize: 9,
  fontWeight: 500,
  letterSpacing: "0.07em",
  textTransform: "uppercase",
  color: "var(--text-tertiary)",
  marginBottom: 4,
};

const metaValueStyle: React.CSSProperties = {
  fontSize: 12,
  color: "var(--text-secondary)",
  fontWeight: 500,
};

export function DetailDock() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const requests = useRequests();

  const dockId = searchParams.get("dock");
  const request = dockId ? requests.find((r) => r.id === dockId) : null;

  if (!request) return null;

  function close() {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("dock");
    const qs = params.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  }

  const phaseLabel = PHASE_LABELS[request.phase ?? "predesign"] ?? request.phase;
  const stageKey =
    request.phase === "predesign" ? (request.predesignStage ?? "intake") :
    request.phase === "design" ? (request.designStage ?? "explore") :
    request.phase === "dev" ? (request.kanbanState ?? "todo") :
    (request.trackStage ?? "measuring");
  const stageLabel = STAGE_LABELS[stageKey] ?? stageKey;
  const statusStyle = STATUS_COLORS[request.status] ?? { bg: "#F0EDE6", color: "#78716C" };

  return (
    <aside
      className="flex flex-col shrink-0 overflow-y-auto"
      style={{
        width: "var(--dock-width)",
        background: "var(--bg-surface)",
        borderLeft: "1px solid var(--border)",
        height: "100vh",
        position: "sticky",
        top: 0,
        animation: "dockSlideIn 200ms ease-out",
      }}
    >

      {/* Header */}
      <div
        className="flex items-start justify-between px-5 py-4"
        style={{ borderBottom: "1px solid var(--border)" }}
      >
        <div className="flex flex-col gap-1.5 min-w-0">
          <p
            style={{
              fontFamily: "'Geist Mono', monospace",
              fontSize: 10,
              color: "var(--text-tertiary)",
              letterSpacing: "0.04em",
            }}
          >
            #{request.id.slice(0, 6).toUpperCase()}
          </p>
          <h2
            style={{
              fontSize: 15,
              fontWeight: 600,
              color: "var(--text-primary)",
              lineHeight: 1.3,
            }}
          >
            {request.title}
          </h2>
          <div className="flex items-center gap-2 flex-wrap mt-1">
            <span
              className="rounded"
              style={{
                fontFamily: "'Geist Mono', monospace",
                fontSize: 9,
                fontWeight: 600,
                letterSpacing: "0.06em",
                textTransform: "uppercase",
                padding: "2px 6px",
                background: statusStyle.bg,
                color: statusStyle.color,
              }}
            >
              {request.status.replace(/_/g, " ")}
            </span>
            <span
              style={{
                fontFamily: "'Geist Mono', monospace",
                fontSize: 9,
                color: "var(--text-tertiary)",
                letterSpacing: "0.04em",
                textTransform: "uppercase",
              }}
            >
              {phaseLabel} · {stageLabel}
            </span>
          </div>
        </div>
        <button
          onClick={close}
          className="shrink-0 rounded flex items-center justify-center transition-colors"
          style={{
            width: 28,
            height: 28,
            color: "var(--text-tertiary)",
            background: "transparent",
            border: "none",
            cursor: "pointer",
          }}
        >
          <X size={14} />
        </button>
      </div>

      {/* Body */}
      <div className="flex flex-col gap-5 px-5 py-5">

        {/* Problem statement */}
        {request.description && (
          <div>
            <p style={labelStyle}>Problem</p>
            <p style={{ fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.6 }}>
              {request.description}
            </p>
          </div>
        )}

        {/* Business context */}
        {request.businessContext && (
          <div>
            <p style={labelStyle}>Business context</p>
            <p style={{ fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.6 }}>
              {request.businessContext}
            </p>
          </div>
        )}

        {/* Success metrics */}
        {request.successMetrics && (
          <div>
            <p style={labelStyle}>Success metrics</p>
            <p style={{ fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.6 }}>
              {request.successMetrics}
            </p>
          </div>
        )}

        {/* Meta grid */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <p style={labelStyle}>Priority</p>
            <p style={metaValueStyle}>
              {request.priority ? PRIORITY_LABELS[request.priority] : "—"}
            </p>
          </div>
          <div>
            <p style={labelStyle}>Type</p>
            <p style={metaValueStyle}>{request.requestType ?? "—"}</p>
          </div>
          <div>
            <p style={labelStyle}>Due</p>
            <p style={metaValueStyle}>{formatDate(request.deadlineAt ?? null)}</p>
          </div>
          <div>
            <p style={labelStyle}>Created</p>
            <p style={metaValueStyle}>{formatDate(request.createdAt)}</p>
          </div>
          {request.complexity && (
            <div>
              <p style={labelStyle}>Complexity</p>
              <p style={metaValueStyle}>{request.complexity} / 5</p>
            </div>
          )}
          {request.impactPrediction && (
            <div>
              <p style={labelStyle}>Predicted impact</p>
              <p style={metaValueStyle}>{request.impactPrediction}</p>
            </div>
          )}
        </div>

        {/* Figma link */}
        {request.figmaUrl && (
          <div>
            <p style={labelStyle}>Figma</p>
            <a
              href={request.figmaUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                fontSize: 12,
                color: "var(--accent)",
                fontWeight: 500,
                wordBreak: "break-all",
                textDecoration: "none",
              }}
            >
              {request.figmaUrl}
            </a>
          </div>
        )}

        {/* Actual impact (if logged) */}
        {request.impactActual && (
          <div>
            <p style={labelStyle}>Actual impact</p>
            <p style={{ fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.6 }}>
              {request.impactActual}
            </p>
          </div>
        )}
      </div>
    </aside>
  );
}
