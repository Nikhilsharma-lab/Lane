"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { DECISION_BADGE } from "@/lib/theme-colors";
import { saveEngineeringFeasibility } from "@/app/actions/design-stages";

type SignerRole = "designer" | "pm" | "design_head";
type Decision = "approved" | "approved_with_conditions" | "rejected";

interface Signoff {
  id: string;
  signerRole: SignerRole;
  decision: Decision;
  conditions: string | null;
  comments: string | null;
  signedAt: string;
}

interface ProveGateProps {
  requestId: string;
  myProfileRole: string; // raw profile role (designer/pm/lead/admin)
  isTestUser?: boolean;  // test account — can sign for any role
  initialFeasibility?: string | null;
}

const ROLES: { key: SignerRole; label: string; desc: string }[] = [
  { key: "designer",    label: "Designer",    desc: "Design is complete and ready" },
  { key: "pm",          label: "PM",          desc: "Solves the original problem" },
  { key: "design_head", label: "Design Head", desc: "Quality standards met" },
];

function signerRoleFromProfile(role: string): SignerRole | null {
  if (role === "designer") return "designer";
  if (role === "pm") return "pm";
  if (role === "lead" || role === "admin") return "design_head";
  return null;
}

const decisionStyles: Record<Decision, string> = {
  approved: DECISION_BADGE.approved,
  approved_with_conditions: DECISION_BADGE.approved_with_conditions,
  rejected: DECISION_BADGE.rejected,
};

const decisionLabels: Record<Decision, string> = {
  approved: "Approved",
  approved_with_conditions: "Approved with conditions",
  rejected: "Rejected",
};

export function ProveGate({
  requestId,
  myProfileRole,
  isTestUser = false,
  initialFeasibility = null,
}: ProveGateProps) {
  const router = useRouter();
  const mySignerRole = signerRoleFromProfile(myProfileRole);

  const [signoffs, setSignoffs] = useState<Signoff[]>([]);
  const [optimisticSignoffs, setOptimisticSignoffs] = useState<Signoff[]>(signoffs);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [feasibility, setFeasibility] = useState(initialFeasibility ?? "");
  const [feasibilitySaved, setFeasibilitySaved] = useState(true);
  const [feasibilityPending, setFeasibilityPending] = useState(false);

  const [handoffBrief, setHandoffBrief] = useState<{
    designDecisions: Array<{ decision: string; rationale: string }>;
    openQuestions: string[];
    buildSequence: string[];
    figmaNotes: string;
    edgeCases: string[];
    accessibilityGaps: string[];
  } | null>(null);
  const [handoffLoading, setHandoffLoading] = useState(false);
  const [handoffFetched, setHandoffFetched] = useState(false);

  function handleFeasibilitySave() {
    setFeasibilityPending(true);
    saveEngineeringFeasibility(requestId, feasibility)
      .then(() => {
        setFeasibilitySaved(true);
      })
      .catch((err) => {
        console.error("[prove-gate] feasibility save failed:", err);
      })
      .finally(() => setFeasibilityPending(false));
  }

  function handleFeasibilityBlur() {
    if (!feasibilitySaved && feasibility.trim()) {
      handleFeasibilitySave();
    }
  }

  async function fetchHandoffBrief() {
    setHandoffLoading(true);
    try {
      const res = await fetch(
        `/api/requests/${requestId}/handoff-brief`,
        { method: "POST" },
      );
      if (!res.ok) throw new Error("Failed to generate");
      const data = await res.json();
      const brief = data.brief ?? data;
      setHandoffBrief(brief);
      setHandoffFetched(true);
    } catch (err) {
      console.error("[prove-gate] handoff brief failed:", err);
    } finally {
      setHandoffLoading(false);
    }
  }

  useEffect(() => {
    setOptimisticSignoffs(signoffs);
  }, [signoffs]);

  // Per-role action state
  const [activeRole, setActiveRole] = useState<SignerRole | null>(null);
  const [activeDecision, setActiveDecision] = useState<Decision | null>(null);
  const [conditions, setConditions] = useState("");
  const [commentText, setCommentText] = useState("");

  const fetchSignoffs = useCallback(async () => {
    try {
      const res = await fetch(`/api/requests/${requestId}/validate`);
      const data = await res.json();
      if (res.ok) setSignoffs(data.signoffs);
    } finally {
      setLoading(false);
    }
  }, [requestId]);

  useEffect(() => { fetchSignoffs(); }, [fetchSignoffs]);

  async function handleSubmit() {
    const submittingRole = activeRole ?? mySignerRole;
    if (!activeDecision || !submittingRole) return;
    setError(null);

    // Optimistic: immediately show this role as signed
    const tempSignoff: Signoff = {
      id: `temp-${submittingRole}`,
      signerRole: submittingRole,
      decision: activeDecision,
      conditions: activeDecision === "approved_with_conditions" ? conditions || null : null,
      comments: activeDecision === "rejected" ? commentText || null : null,
      signedAt: new Date().toISOString(),
    };
    setOptimisticSignoffs((prev) => {
      const without = prev.filter((s) => s.signerRole !== submittingRole);
      return [...without, tempSignoff];
    });
    setActiveRole(null);
    setActiveDecision(null);
    setConditions("");
    setCommentText("");

    const res = await fetch(`/api/requests/${requestId}/validate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        decision: activeDecision,
        conditions,
        comments: commentText,
        ...(isTestUser && { signerRole: submittingRole }),
      }),
    });

    if (!res.ok) {
      // Rollback
      setOptimisticSignoffs(signoffs);
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Failed to submit sign-off — please try again");
      return;
    }

    const data = await res.json().catch(() => ({}));
    if (data.autoAdvanced) {
      router.refresh();
    } else {
      await fetchSignoffs();
    }
  }

  const mySignoff = signoffs.find((s) => s.signerRole === mySignerRole);
  const allSigned = ["designer", "pm", "design_head"].every((r) =>
    signoffs.some((s) => s.signerRole === r && s.decision !== "rejected")
  );
  const anyRejected = signoffs.some((s) => s.decision === "rejected");

  return (
    <div className="space-y-3">
      {/* Status banner */}
      {allSigned && (
        <Callout variant="success" className="py-2.5 flex items-center gap-2">
          <span className="text-xs">✓</span>
          <p className="text-[11px]">All 3 sign-offs received — advancing to Handoff</p>
        </Callout>
      )}
      {anyRejected && !allSigned && (
        <Callout variant="error" className="py-2.5">
          <p className="text-[11px]">Validation rejected — design needs revision before re-submission</p>
        </Callout>
      )}

      {loading ? (
        <div className="flex items-center gap-2 py-2">
          <div className="w-3 h-3 border border-border/80 border-t-transparent rounded-full animate-spin" />
          <span className="text-xs text-muted-foreground/60">Loading sign-offs...</span>
        </div>
      ) : (
        <>
          {/* 3-row sign-off table */}
          <div className="border border rounded-xl overflow-hidden divide-y ">
            {ROLES.map((role) => {
              const signoff = optimisticSignoffs.find((s) => s.signerRole === role.key);
              const isMyRole = mySignerRole === role.key;
              // Admins can act for any role
              const canAct = isMyRole || isTestUser;
              const isActiveRow = activeRole === role.key || (!activeRole && isMyRole && !isTestUser);

              return (
                <div key={role.key} className="px-4 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-medium text-foreground">{role.label}</span>
                        {isMyRole && (
                          <span className="text-[10px] text-accent-active bg-accent-active/10 border border-accent-active/20 rounded px-1.5 py-0.5">you</span>
                        )}
                      </div>
                      <p className="text-[11px] text-muted-foreground/60 mt-0.5">{role.desc}</p>
                      {signoff?.conditions && (
                        <p className="text-[11px] text-accent-warning/80 mt-1 italic">Conditions: {signoff.conditions}</p>
                      )}
                    </div>

                    {/* Status */}
                    <div className="shrink-0">
                      {signoff ? (
                        <span className={`text-[10px] px-2 py-0.5 rounded border font-medium ${decisionStyles[signoff.decision]}`}>
                          {decisionLabels[signoff.decision]}
                        </span>
                      ) : (
                        <span className="text-[10px] text-muted-foreground/60 bg-muted border border rounded px-2 py-0.5">Pending</span>
                      )}
                    </div>
                  </div>

                  {/* Action buttons — shown for current user's role, or all roles if admin */}
                  {canAct && !allSigned && (
                    <div className="mt-3 space-y-2">
                      {/* Decision buttons */}
                      <div className="flex gap-1.5 flex-wrap">
                        {(["approved", "approved_with_conditions", "rejected"] as Decision[]).map((d) => (
                          <Button
                            key={d}
                            variant="outline"
                            size="xs"
                            onClick={() => {
                              setActiveRole(role.key);
                              setActiveDecision(activeDecision === d && isActiveRow ? null : d);
                            }}
                            className={
                              activeDecision === d && isActiveRow
                                ? d === "approved"
                                  ? "bg-accent-success/15 border-accent-success/30 text-accent-success"
                                  : d === "approved_with_conditions"
                                  ? "bg-accent-warning/15 border-accent-warning/30 text-accent-warning"
                                  : "bg-accent-danger/15 border-accent-danger/30 text-accent-danger"
                                : ""
                            }
                          >
                            {d === "approved" ? "Approve" : d === "approved_with_conditions" ? "Approve with conditions" : "Reject"}
                          </Button>
                        ))}
                      </div>

                      {/* Conditions input */}
                      {activeDecision === "approved_with_conditions" && isActiveRow && (
                        <Input
                          type="text"
                          value={conditions}
                          onChange={(e) => setConditions(e.target.value)}
                          placeholder="Describe the conditions..."
                          inputSize="sm"
                        />
                      )}

                      {/* Rejection reason */}
                      {activeDecision === "rejected" && isActiveRow && (
                        <Input
                          type="text"
                          value={commentText}
                          onChange={(e) => setCommentText(e.target.value)}
                          placeholder="Reason for rejection..."
                          inputSize="sm"
                        />
                      )}

                      {/* Submit */}
                      {activeDecision && isActiveRow && (
                        <Button
                          variant={activeDecision === "rejected" ? "destructive" : "default"}
                          size="xs"
                          onClick={handleSubmit}
                          disabled={activeDecision === "approved_with_conditions" && !conditions.trim()}
                          className={
                            activeDecision === "rejected"
                              ? "bg-accent-danger hover:bg-accent-danger/80 text-white"
                              : ""
                          }
                        >
                          Confirm
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Progress summary */}
          <p className="text-[10px] text-muted-foreground/60 text-center">
            {signoffs.filter((s) => s.decision !== "rejected").length} / 3 approvals received
          </p>
        </>
      )}

      {error && (
        <Callout variant="error">{error}</Callout>
      )}

      {/* Engineering feasibility — non-blocking, async */}
      <div className="space-y-2 border-t pt-4">
        <label className="text-xs font-medium text-foreground">
          Engineering feasibility notes
        </label>
        <p className="text-[11px] text-muted-foreground">
          Non-blocking. Engineers can flag concerns or constraints here
          during the Prove review.
        </p>
        <Textarea
          value={feasibility}
          onChange={(e) => {
            setFeasibility(e.target.value);
            setFeasibilitySaved(false);
          }}
          onBlur={handleFeasibilityBlur}
          placeholder="Any technical concerns, constraints, or notes for the build phase?"
          rows={3}
          className="text-xs resize-y"
        />
        <span className="text-[10px] text-muted-foreground/50">
          {feasibilityPending ? "Saving..." : feasibilitySaved ? "Saved" : "Unsaved changes"}
        </span>
      </div>

      {/* AI Handoff checklist */}
      <div className="border-t pt-4">
        {!handoffFetched && !handoffLoading && (
          <div className="border border-dashed rounded-lg p-4 text-center space-y-2">
            <p className="text-[11px] text-muted-foreground">
              AI can generate a handoff checklist covering design decisions,
              open questions, build sequence, and edge cases.
            </p>
            <Button
              variant="secondary"
              size="sm"
              onClick={fetchHandoffBrief}
            >
              Generate handoff checklist
            </Button>
          </div>
        )}

        {handoffLoading && (
          <div className="border border-dashed rounded-lg p-4 text-center">
            <p className="text-[11px] text-muted-foreground animate-pulse">
              Generating handoff checklist...
            </p>
          </div>
        )}

        {handoffFetched && handoffBrief && (
          <div className="border rounded-lg p-4 space-y-3">
            <p className="text-xs font-medium text-foreground">
              AI handoff checklist
            </p>

            {handoffBrief.designDecisions.length > 0 && (
              <div className="space-y-1">
                <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
                  Design decisions
                </p>
                {handoffBrief.designDecisions.map((d, i) => (
                  <div key={i} className="text-xs text-muted-foreground">
                    <span className="font-medium text-foreground">
                      {d.decision}
                    </span>
                    {d.rationale && ` — ${d.rationale}`}
                  </div>
                ))}
              </div>
            )}

            {handoffBrief.buildSequence.length > 0 && (
              <div className="space-y-1">
                <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
                  Build sequence
                </p>
                {handoffBrief.buildSequence.map((step, i) => (
                  <p key={i} className="text-xs text-muted-foreground flex items-start gap-1.5">
                    <span className="text-muted-foreground/40 shrink-0 font-mono text-[10px]">
                      {i + 1}.
                    </span>
                    {step}
                  </p>
                ))}
              </div>
            )}

            {handoffBrief.openQuestions.length > 0 && (
              <div className="space-y-1">
                <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
                  Open questions
                </p>
                {handoffBrief.openQuestions.map((q, i) => (
                  <p key={i} className="text-xs text-muted-foreground flex items-start gap-1.5">
                    <span className="text-muted-foreground/40 shrink-0">?</span>
                    {q}
                  </p>
                ))}
              </div>
            )}

            {handoffBrief.edgeCases.length > 0 && (
              <div className="space-y-1">
                <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
                  Edge cases
                </p>
                {handoffBrief.edgeCases.map((ec, i) => (
                  <p key={i} className="text-xs text-muted-foreground flex items-start gap-1.5">
                    <span className="text-muted-foreground/40 shrink-0">!</span>
                    {ec}
                  </p>
                ))}
              </div>
            )}

            {handoffBrief.accessibilityGaps && handoffBrief.accessibilityGaps.length > 0 && (
              <div className="space-y-1">
                <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
                  Accessibility gaps
                </p>
                {handoffBrief.accessibilityGaps.map((gap, i) => (
                  <p key={i} className="text-xs text-muted-foreground flex items-start gap-1.5">
                    <span className="text-muted-foreground/40 shrink-0">♿</span>
                    {gap}
                  </p>
                ))}
              </div>
            )}

            {handoffBrief.figmaNotes && (
              <div className="space-y-1">
                <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
                  Figma notes
                </p>
                <p className="text-xs text-muted-foreground">
                  {handoffBrief.figmaNotes}
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
