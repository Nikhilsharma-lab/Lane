"use client";

import { formatDistanceToNow } from "date-fns";
import { Sparkles, AlertTriangle } from "lucide-react";
import { IntakeActions } from "./intake-actions";

interface AiAnalysis {
  priority: string;
  complexity: number;
  requestType: string;
  qualityScore: number;
  summary: string;
  reasoning: string;
  suggestions: string[];
  potentialDuplicates: { id: string; title: string; reason: string }[];
}

interface IntakeDetailRequest {
  id: string;
  title: string;
  description: string;
  businessContext: string | null;
  successMetrics: string | null;
  priority: string | null;
  createdAt: Date | string;
  requesterName: string;
}

interface IntakeDetailProps {
  request: IntakeDetailRequest;
  aiAnalysis: AiAnalysis | null;
}

/* ── Shared label style (matches detail-dock.tsx pattern) ────────────── */
const labelStyle: React.CSSProperties = {
  fontFamily: "'Geist Mono', monospace",
  fontSize: 9,
  fontWeight: 500,
  textTransform: "uppercase",
  letterSpacing: "0.06em",
  color: "hsl(var(--muted-foreground) / 0.6)",
  marginBottom: 4,
};

const sectionStyle: React.CSSProperties = {
  padding: "12px 0",
  borderBottom: "1px solid hsl(var(--border))",
};

function QualityBar({ score }: { score: number }) {
  const clampedScore = Math.max(0, Math.min(100, score));
  const color =
    clampedScore >= 70 ? "hsl(var(--primary))" : clampedScore >= 40 ? "#dd6b20" : "#c53030";

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <div
        style={{
          flex: 1,
          height: 4,
          borderRadius: 2,
          background: "hsl(var(--accent))",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            width: `${clampedScore}%`,
            height: "100%",
            borderRadius: 2,
            background: color,
            transition: "width 0.3s ease",
          }}
        />
      </div>
      <span
        style={{
          fontFamily: "'Geist Mono', monospace",
          fontSize: 11,
          fontWeight: 600,
          color,
        }}
      >
        {clampedScore}
      </span>
    </div>
  );
}

export function IntakeDetail({ request, aiAnalysis }: IntakeDetailProps) {
  const relativeTime = formatDistanceToNow(
    typeof request.createdAt === "string" ? new Date(request.createdAt) : request.createdAt,
    { addSuffix: true }
  );

  return (
    <div
      style={{
        padding: "20px 24px",
        overflowY: "auto",
        height: "100%",
      }}
    >
      {/* Title + ID badge */}
      <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
        <h2
          style={{
            fontFamily: "'Geist', sans-serif",
            fontSize: 18,
            fontWeight: 600,
            color: "hsl(var(--foreground))",
            margin: 0,
            flex: 1,
            lineHeight: 1.3,
          }}
        >
          {request.title}
        </h2>
        <span
          style={{
            fontFamily: "'Geist Mono', monospace",
            fontSize: 10,
            fontWeight: 500,
            color: "hsl(var(--muted-foreground) / 0.6)",
            background: "hsl(var(--muted))",
            border: "1px solid hsl(var(--border))",
            borderRadius: 4,
            padding: "2px 6px",
            flexShrink: 0,
          }}
        >
          {request.id.slice(0, 8).toUpperCase()}
        </span>
      </div>

      {/* Meta line */}
      <div style={{ marginTop: 6, display: "flex", alignItems: "center", gap: 8 }}>
        <span
          style={{
            fontFamily: "'Geist Mono', monospace",
            fontSize: 11,
            color: "hsl(var(--muted-foreground))",
          }}
        >
          {request.requesterName}
        </span>
        <span
          style={{
            fontFamily: "'Geist Mono', monospace",
            fontSize: 10,
            color: "hsl(var(--muted-foreground) / 0.6)",
          }}
        >
          {relativeTime}
        </span>
        {request.priority && (
          <span
            style={{
              fontFamily: "'Geist Mono', monospace",
              fontSize: 9,
              fontWeight: 600,
              padding: "1px 5px",
              borderRadius: 3,
              background: `var(--priority-${request.priority}-bg, var(--bg-hover))`,
              color: `var(--priority-${request.priority}-text, var(--text-secondary))`,
            }}
          >
            {request.priority.toUpperCase()}
          </span>
        )}
      </div>

      {/* ── Description ──────────────────────────────────────────────────── */}
      <div style={sectionStyle}>
        <div style={labelStyle}>DESCRIPTION</div>
        <p
          style={{
            fontFamily: "'Geist', sans-serif",
            fontSize: 13,
            lineHeight: 1.6,
            color: "hsl(var(--foreground))",
            margin: 0,
            whiteSpace: "pre-wrap",
          }}
        >
          {request.description}
        </p>
      </div>

      {/* ── Business Context ─────────────────────────────────────────────── */}
      {request.businessContext && (
        <div style={sectionStyle}>
          <div style={labelStyle}>BUSINESS CONTEXT</div>
          <p
            style={{
              fontFamily: "'Geist', sans-serif",
              fontSize: 13,
              lineHeight: 1.6,
              color: "hsl(var(--foreground))",
              margin: 0,
              whiteSpace: "pre-wrap",
            }}
          >
            {request.businessContext}
          </p>
        </div>
      )}

      {/* ── Success Metrics ──────────────────────────────────────────────── */}
      {request.successMetrics && (
        <div style={sectionStyle}>
          <div style={labelStyle}>SUCCESS METRICS</div>
          <p
            style={{
              fontFamily: "'Geist', sans-serif",
              fontSize: 13,
              lineHeight: 1.6,
              color: "hsl(var(--foreground))",
              margin: 0,
              whiteSpace: "pre-wrap",
            }}
          >
            {request.successMetrics}
          </p>
        </div>
      )}

      {/* ── AI Triage Section ─────────────────────────────────────────────── */}
      {aiAnalysis && (
        <div
          style={{
            marginTop: 16,
            padding: 16,
            borderRadius: 8,
            background: "hsl(var(--muted))",
            border: "1px solid hsl(var(--border))",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 12 }}>
            <Sparkles size={13} style={{ color: "hsl(var(--primary))" }} />
            <span
              style={{
                fontFamily: "'Geist Mono', monospace",
                fontSize: 10,
                fontWeight: 600,
                textTransform: "uppercase",
                letterSpacing: "0.06em",
                color: "hsl(var(--primary))",
              }}
            >
              AI TRIAGE
            </span>
          </div>

          {/* Summary */}
          <p
            style={{
              fontFamily: "'Geist', sans-serif",
              fontSize: 13,
              lineHeight: 1.5,
              color: "hsl(var(--foreground))",
              margin: "0 0 12px",
            }}
          >
            {aiAnalysis.summary}
          </p>

          {/* Quality score */}
          <div style={{ marginBottom: 12 }}>
            <div style={labelStyle}>QUALITY SCORE</div>
            <QualityBar score={aiAnalysis.qualityScore} />
          </div>

          {/* Inline meta */}
          <div style={{ display: "flex", gap: 16, marginBottom: 12 }}>
            <div>
              <div style={labelStyle}>PRIORITY</div>
              <span
                style={{
                  fontFamily: "'Geist Mono', monospace",
                  fontSize: 12,
                  fontWeight: 600,
                  color: "hsl(var(--foreground))",
                }}
              >
                {aiAnalysis.priority.toUpperCase()}
              </span>
            </div>
            <div>
              <div style={labelStyle}>COMPLEXITY</div>
              <span
                style={{
                  fontFamily: "'Geist Mono', monospace",
                  fontSize: 12,
                  fontWeight: 600,
                  color: "hsl(var(--foreground))",
                }}
              >
                {aiAnalysis.complexity}/5
              </span>
            </div>
            <div>
              <div style={labelStyle}>TYPE</div>
              <span
                style={{
                  fontFamily: "'Geist Mono', monospace",
                  fontSize: 12,
                  fontWeight: 500,
                  color: "hsl(var(--foreground))",
                  textTransform: "capitalize",
                }}
              >
                {aiAnalysis.requestType}
              </span>
            </div>
          </div>

          {/* Reasoning */}
          <div style={{ marginBottom: 12 }}>
            <div style={labelStyle}>REASONING</div>
            <p
              style={{
                fontFamily: "'Geist', sans-serif",
                fontSize: 12,
                lineHeight: 1.5,
                color: "hsl(var(--muted-foreground))",
                margin: 0,
                whiteSpace: "pre-wrap",
              }}
            >
              {aiAnalysis.reasoning}
            </p>
          </div>

          {/* Suggestions */}
          {aiAnalysis.suggestions.length > 0 && (
            <div style={{ marginBottom: 12 }}>
              <div style={labelStyle}>SUGGESTIONS</div>
              <ul
                style={{
                  margin: 0,
                  paddingLeft: 16,
                  listStyle: "disc",
                }}
              >
                {aiAnalysis.suggestions.map((s, i) => (
                  <li
                    key={i}
                    style={{
                      fontFamily: "'Geist', sans-serif",
                      fontSize: 12,
                      lineHeight: 1.5,
                      color: "hsl(var(--muted-foreground))",
                      marginBottom: 2,
                    }}
                  >
                    {s}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Potential duplicates */}
          {aiAnalysis.potentialDuplicates.length > 0 && (
            <div>
              <div style={{ ...labelStyle, display: "flex", alignItems: "center", gap: 4 }}>
                <AlertTriangle size={10} />
                POTENTIAL DUPLICATES
              </div>
              {aiAnalysis.potentialDuplicates.map((dup) => (
                <div
                  key={dup.id}
                  style={{
                    padding: "6px 8px",
                    borderRadius: 4,
                    background: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    marginBottom: 4,
                  }}
                >
                  <span
                    style={{
                      fontFamily: "'Geist', sans-serif",
                      fontSize: 12,
                      fontWeight: 500,
                      color: "hsl(var(--foreground))",
                    }}
                  >
                    {dup.title}
                  </span>
                  <span
                    style={{
                      fontFamily: "'Geist Mono', monospace",
                      fontSize: 10,
                      color: "hsl(var(--muted-foreground) / 0.6)",
                      marginLeft: 6,
                    }}
                  >
                    {dup.id.slice(0, 6).toUpperCase()}
                  </span>
                  <p
                    style={{
                      fontFamily: "'Geist', sans-serif",
                      fontSize: 11,
                      color: "hsl(var(--muted-foreground) / 0.6)",
                      margin: "2px 0 0",
                    }}
                  >
                    {dup.reason}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Actions ──────────────────────────────────────────────────────── */}
      <div style={{ marginTop: 16 }}>
        <IntakeActions requestId={request.id} />
      </div>
    </div>
  );
}
