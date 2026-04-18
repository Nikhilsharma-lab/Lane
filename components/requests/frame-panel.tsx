"use client";

interface FramePanelProps {
  requestId: string;
  initialFrame: {
    problem: string;
    successCriteria: string;
    constraints: string;
    divergence: string;
  };
  originalProblem: string | null;
}

export function FramePanel(_props: FramePanelProps) {
  return (
    <p className="text-xs text-muted-foreground">
      Frame panel coming in Stop 3.
    </p>
  );
}
