"use client";

import { formatDistanceToNow } from "date-fns";
import { Sparkles, AlertTriangle } from "lucide-react";
import { IntakeActions } from "./intake-actions";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

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

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="font-mono text-[9px] font-medium uppercase tracking-[0.06em] text-muted-foreground/60 mb-1">
      {children}
    </div>
  );
}

function QualityBar({ score }: { score: number }) {
  const clampedScore = Math.max(0, Math.min(100, score));
  const colorClass =
    clampedScore >= 70
      ? "text-primary"
      : clampedScore >= 40
        ? "text-[var(--accent-warning)]"
        : "text-[var(--accent-danger)]";

  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1 rounded-sm bg-accent overflow-hidden">
        <div
          className={cn(
            "h-full rounded-sm transition-[width] duration-300 ease-out",
            clampedScore >= 70
              ? "bg-primary"
              : clampedScore >= 40
                ? "bg-[var(--accent-warning)]"
                : "bg-[var(--accent-danger)]"
          )}
          style={{ width: `${clampedScore}%` }}
        />
      </div>
      <span className={cn("font-mono text-[11px] font-semibold", colorClass)}>
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
    <div className="px-6 py-5 overflow-y-auto h-full">
      {/* Title + ID badge */}
      <div className="flex items-start gap-2">
        <h2 className="text-lg font-semibold text-foreground flex-1 leading-snug">
          {request.title}
        </h2>
        <Badge variant="outline" className="font-mono text-[10px] font-medium shrink-0">
          {request.id.slice(0, 8).toUpperCase()}
        </Badge>
      </div>

      {/* Meta line */}
      <div className="mt-1.5 flex items-center gap-2">
        <span className="font-mono text-[11px] text-muted-foreground">
          {request.requesterName}
        </span>
        <span className="font-mono text-[10px] text-muted-foreground/60">
          {relativeTime}
        </span>
        {request.priority && (
          <span
            className="font-mono text-[9px] font-semibold px-1.5 py-px rounded-sm"
            style={{
              background: `var(--priority-${request.priority}-bg, var(--accent))`,
              color: `var(--priority-${request.priority}-text, var(--muted-foreground))`,
            }}
          >
            {request.priority.toUpperCase()}
          </span>
        )}
      </div>

      {/* Description */}
      <div className="py-3 border-b border-border">
        <SectionLabel>DESCRIPTION</SectionLabel>
        <p className="text-[13px] leading-relaxed text-foreground whitespace-pre-wrap">
          {request.description}
        </p>
      </div>

      {/* Business Context */}
      {request.businessContext && (
        <div className="py-3 border-b border-border">
          <SectionLabel>BUSINESS CONTEXT</SectionLabel>
          <p className="text-[13px] leading-relaxed text-foreground whitespace-pre-wrap">
            {request.businessContext}
          </p>
        </div>
      )}

      {/* Success Metrics */}
      {request.successMetrics && (
        <div className="py-3 border-b border-border">
          <SectionLabel>SUCCESS METRICS</SectionLabel>
          <p className="text-[13px] leading-relaxed text-foreground whitespace-pre-wrap">
            {request.successMetrics}
          </p>
        </div>
      )}

      {/* AI Triage Section */}
      {aiAnalysis && (
        <Card className="mt-4 bg-muted">
          <CardContent className="space-y-3">
            <div className="flex items-center gap-1.5">
              <Sparkles size={13} className="text-primary" />
              <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.06em] text-primary">
                AI TRIAGE
              </span>
            </div>

            {/* Summary */}
            <p className="text-[13px] leading-normal text-foreground">
              {aiAnalysis.summary}
            </p>

            {/* Quality score */}
            <div>
              <SectionLabel>QUALITY SCORE</SectionLabel>
              <QualityBar score={aiAnalysis.qualityScore} />
            </div>

            {/* Inline meta */}
            <div className="flex gap-4">
              <div>
                <SectionLabel>PRIORITY</SectionLabel>
                <span className="font-mono text-xs font-semibold text-foreground">
                  {aiAnalysis.priority.toUpperCase()}
                </span>
              </div>
              <div>
                <SectionLabel>COMPLEXITY</SectionLabel>
                <span className="font-mono text-xs font-semibold text-foreground">
                  {aiAnalysis.complexity}/5
                </span>
              </div>
              <div>
                <SectionLabel>TYPE</SectionLabel>
                <span className="font-mono text-xs font-medium text-foreground capitalize">
                  {aiAnalysis.requestType}
                </span>
              </div>
            </div>

            {/* Reasoning */}
            <div>
              <SectionLabel>REASONING</SectionLabel>
              <p className="text-xs leading-normal text-muted-foreground whitespace-pre-wrap">
                {aiAnalysis.reasoning}
              </p>
            </div>

            {/* Suggestions */}
            {aiAnalysis.suggestions.length > 0 && (
              <div>
                <SectionLabel>SUGGESTIONS</SectionLabel>
                <ul className="pl-4 list-disc">
                  {aiAnalysis.suggestions.map((s, i) => (
                    <li
                      key={i}
                      className="text-xs leading-normal text-muted-foreground mb-0.5"
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
                <div className="font-mono text-[9px] font-medium uppercase tracking-[0.06em] text-muted-foreground/60 mb-1 flex items-center gap-1">
                  <AlertTriangle size={10} />
                  POTENTIAL DUPLICATES
                </div>
                {aiAnalysis.potentialDuplicates.map((dup) => (
                  <div
                    key={dup.id}
                    className="px-2 py-1.5 rounded bg-card border border-border mb-1"
                  >
                    <span className="text-xs font-medium text-foreground">
                      {dup.title}
                    </span>
                    <span className="font-mono text-[10px] text-muted-foreground/60 ml-1.5">
                      {dup.id.slice(0, 6).toUpperCase()}
                    </span>
                    <p className="text-[11px] text-muted-foreground/60 mt-0.5">
                      {dup.reason}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Actions */}
      <div className="mt-4">
        <IntakeActions requestId={request.id} />
      </div>
    </div>
  );
}
