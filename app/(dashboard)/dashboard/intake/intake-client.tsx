"use client";

import { useState } from "react";
import { IntakeSidebar, type IntakeSidebarRequest } from "@/components/intake/intake-sidebar";
import { IntakeDetail } from "@/components/intake/intake-detail";

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

interface DetailRequest {
  request: {
    id: string;
    title: string;
    description: string;
    businessContext: string | null;
    successMetrics: string | null;
    priority: string | null;
    createdAt: string;
    requesterName: string;
  };
  aiAnalysis: AiAnalysis | null;
}

interface IntakeClientWrapperProps {
  sidebarRequests: IntakeSidebarRequest[];
  detailRequests: DetailRequest[];
}

export function IntakeClientWrapper({
  sidebarRequests,
  detailRequests,
}: IntakeClientWrapperProps) {
  const [activeId, setActiveId] = useState<string | null>(
    sidebarRequests[0]?.id ?? null
  );

  const activeDetail = detailRequests.find((d) => d.request.id === activeId);

  return (
    <div style={{ display: "flex", height: "100%" }}>
      {/* Sidebar */}
      <div style={{ width: "33.333%", minWidth: 300, flexShrink: 0 }}>
        <IntakeSidebar
          requests={sidebarRequests}
          activeId={activeId}
          onSelect={setActiveId}
        />
      </div>

      {/* Detail */}
      <div style={{ flex: 1, overflow: "hidden" }}>
        {activeDetail ? (
          <IntakeDetail
            key={activeDetail.request.id}
            request={activeDetail.request}
            aiAnalysis={activeDetail.aiAnalysis}
          />
        ) : (
          <div
            className="text-muted-foreground/60"
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              height: "100%",
              fontFamily: "'Geist Mono', monospace",
              fontSize: 12,
            }}
          >
            Select a request to view details
          </div>
        )}
      </div>
    </div>
  );
}
