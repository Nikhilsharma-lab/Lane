import type { Request, Phase, PredesignStage, DesignStage } from "@/db/schema";

// ── Stage constants ──────────────────────────────────────────────────────────

export const PREDESIGN_STAGES: PredesignStage[] = [
  "intake",
  "context",
  "shape",
  "bet",
];

export const DESIGN_STAGES: DesignStage[] = [
  "sense",
  "frame",
  "diverge",
  "converge",
  "prove",
];

// Legacy flat stages (still used in older requests)
export const LEGACY_STAGES = [
  "intake",
  "context",
  "shape",
  "bet",
  "explore",
  "validate",
  "handoff",
  "build",
  "impact",
] as const;

// ── Phase helpers ────────────────────────────────────────────────────────────

export function getPhaseLabel(phase: Phase): string {
  const labels: Record<Phase, string> = {
    predesign: "Predesign",
    design: "Design",
    dev: "Dev",
    track: "Track & Impact",
  };
  return labels[phase];
}

export function isPredesign(request: Pick<Request, "phase" | "stage">): boolean {
  if (request.phase) return request.phase === "predesign";
  // Fall back to legacy stage mapping
  return PREDESIGN_STAGES.includes(request.stage as PredesignStage);
}

export function isDesign(request: Pick<Request, "phase" | "stage">): boolean {
  if (request.phase) return request.phase === "design";
  return DESIGN_STAGES.includes(request.stage as DesignStage);
}

export function isDev(request: Pick<Request, "phase" | "stage">): boolean {
  if (request.phase) return request.phase === "dev";
  return request.stage === "build";
}

export function isTrack(request: Pick<Request, "phase" | "stage">): boolean {
  if (request.phase) return request.phase === "track";
  return request.stage === "impact";
}

/**
 * Returns the active sub-stage label for display.
 * Uses the new phase model if available, falls back to legacy stage.
 */
export function getActiveStageLabel(request: Pick<Request, "phase" | "stage" | "predesignStage" | "designStage" | "kanbanState" | "trackStage">): string {
  if (request.phase) {
    switch (request.phase) {
      case "predesign":
        return getStageLabel(request.predesignStage ?? "intake");
      case "design":
        return getStageLabel(request.designStage ?? "sense");
      case "dev":
        return getStageLabel(request.kanbanState ?? "todo");
      case "track":
        return getStageLabel(request.trackStage ?? "measuring");
    }
  }
  return getStageLabel(request.stage);
}

export function getStageLabel(stage: string | null | undefined): string {
  const labels: Record<string, string> = {
    // Predesign
    intake: "Intake",
    context: "Context",
    shape: "Shape",
    bet: "Prioritize",
    // Design (5-phase stream model)
    sense: "Sense",
    frame: "Frame",
    diverge: "Diverge",
    converge: "Converge",
    prove: "Prove",
    handoff: "Handoff",
    // Dev (kanban)
    todo: "To Do",
    in_progress: "In Progress",
    in_review: "In Review",
    qa: "QA",
    done: "Done",
    // Track
    measuring: "Measuring",
    complete: "Complete",
    // Legacy
    build: "Building",
    impact: "Impact",
  };
  return labels[stage ?? ""] ?? stage ?? "Unknown";
}

// ── Status mapping ───────────────────────────────────────────────────────────

/**
 * Maps a stage transition to the appropriate request status.
 * Used when auto-updating status on stage advancement.
 */
export const STAGE_STATUS_MAP: Record<string, string> = {
  intake: "submitted",
  context: "submitted",
  shape: "submitted",
  bet: "assigned",
  sense: "in_progress",
  frame: "in_progress",
  diverge: "in_progress",
  converge: "in_review",
  prove: "in_review",
  handoff: "in_review",
  build: "in_progress",
  impact: "completed",
  // Phase-based
  todo: "assigned",
  in_progress: "in_progress",
  in_review: "in_review",
  qa: "in_review",
  done: "shipped",
  measuring: "completed",
  complete: "shipped",
};

// ── Next stage helpers ───────────────────────────────────────────────────────

/**
 * Returns the next predesign sub-stage, or null if at the end.
 */
export function nextPredesignStage(current: PredesignStage): PredesignStage | null {
  const idx = PREDESIGN_STAGES.indexOf(current);
  return idx < PREDESIGN_STAGES.length - 1 ? PREDESIGN_STAGES[idx + 1] : null;
}

/**
 * Returns the next design sub-stage, or null if at the end (ready for dev handoff).
 */
export function nextDesignStage(current: DesignStage): DesignStage | null {
  const idx = DESIGN_STAGES.indexOf(current);
  return idx < DESIGN_STAGES.length - 1 ? DESIGN_STAGES[idx + 1] : null;
}
