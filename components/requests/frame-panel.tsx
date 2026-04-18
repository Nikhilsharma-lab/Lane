"use client";

import { useState, useEffect, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { saveDesignFrame } from "@/app/actions/design-stages";

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

export function FramePanel({
  requestId,
  initialFrame,
  originalProblem,
}: FramePanelProps) {
  const [problem, setProblem] = useState(initialFrame.problem);
  const [successCriteria, setSuccessCriteria] = useState(initialFrame.successCriteria);
  const [constraints, setConstraints] = useState(initialFrame.constraints);
  const [divergence, setDivergence] = useState(initialFrame.divergence);
  const [saved, setSaved] = useState(true);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    const unchanged =
      problem === initialFrame.problem &&
      successCriteria === initialFrame.successCriteria &&
      constraints === initialFrame.constraints &&
      divergence === initialFrame.divergence;
    setSaved(unchanged);
  }, [problem, successCriteria, constraints, divergence, initialFrame]);

  function handleSave() {
    startTransition(async () => {
      await saveDesignFrame(requestId, {
        problem,
        successCriteria,
        constraints,
        divergence,
      });
      setSaved(true);
    });
  }

  function handleBlur() {
    if (!saved) {
      handleSave();
    }
  }

  return (
    <div className="space-y-4">
      {originalProblem && (
        <div className="border border-dashed rounded-lg p-3 space-y-1">
          <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
            PM&apos;s original problem statement
          </p>
          <p className="text-xs text-muted-foreground">{originalProblem}</p>
        </div>
      )}

      <div className="space-y-1.5">
        <label className="text-xs font-medium text-foreground">
          Problem (in your words)
        </label>
        <p className="text-[11px] text-muted-foreground">
          Restate the problem as you understand it. This becomes the north
          star for the rest of the design work.
        </p>
        <Textarea
          value={problem}
          onChange={(e) => setProblem(e.target.value)}
          onBlur={handleBlur}
          placeholder="What problem are you actually solving?"
          rows={3}
          className="text-xs resize-y"
        />
      </div>

      <div className="space-y-1.5">
        <label className="text-xs font-medium text-foreground">
          Success criteria
        </label>
        <p className="text-[11px] text-muted-foreground">
          How will you know the design succeeded? What changes for users?
        </p>
        <Textarea
          value={successCriteria}
          onChange={(e) => setSuccessCriteria(e.target.value)}
          onBlur={handleBlur}
          placeholder="What does success look like?"
          rows={3}
          className="text-xs resize-y"
        />
      </div>

      <div className="space-y-1.5">
        <label className="text-xs font-medium text-foreground">
          Constraints
        </label>
        <p className="text-[11px] text-muted-foreground">
          Technical limits, timeline, platform requirements, accessibility
          needs — anything that bounds the solution space.
        </p>
        <Textarea
          value={constraints}
          onChange={(e) => setConstraints(e.target.value)}
          onBlur={handleBlur}
          placeholder="What can't you change? What must you work within?"
          rows={3}
          className="text-xs resize-y"
        />
      </div>

      <div className="space-y-1.5">
        <label className="text-xs font-medium text-foreground">
          Divergence from original brief
        </label>
        <p className="text-[11px] text-muted-foreground">
          If your understanding of the problem differs from the PM&apos;s
          original framing, note it here. This isn&apos;t a conflict — it&apos;s
          a conversation starter.
        </p>
        <Textarea
          value={divergence}
          onChange={(e) => setDivergence(e.target.value)}
          onBlur={handleBlur}
          placeholder="Optional — how does your frame differ from the PM's?"
          rows={2}
          className="text-xs resize-y"
        />
      </div>

      <div className="flex items-center justify-between">
        <span className="text-[10px] text-muted-foreground/50">
          {saved ? "Saved" : "Unsaved changes"}
        </span>
        {!saved && (
          <Button
            variant="secondary"
            size="xs"
            onClick={handleSave}
            disabled={isPending}
          >
            {isPending ? "Saving..." : "Save"}
          </Button>
        )}
      </div>
    </div>
  );
}
