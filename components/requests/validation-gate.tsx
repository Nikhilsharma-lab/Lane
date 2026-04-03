"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";

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

interface ValidationGateProps {
  requestId: string;
  myProfileRole: string; // raw profile role (designer/pm/lead/admin)
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
  approved: "text-green-400 bg-green-500/10 border-green-500/20",
  approved_with_conditions: "text-amber-400 bg-amber-500/10 border-amber-500/20",
  rejected: "text-red-400 bg-red-500/10 border-red-500/20",
};

const decisionLabels: Record<Decision, string> = {
  approved: "Approved",
  approved_with_conditions: "Approved with conditions",
  rejected: "Rejected",
};

export function ValidationGate({ requestId, myProfileRole }: ValidationGateProps) {
  const router = useRouter();
  const mySignerRole = signerRoleFromProfile(myProfileRole);

  const [signoffs, setSignoffs] = useState<Signoff[]>([]);
  const [optimisticSignoffs, setOptimisticSignoffs] = useState<Signoff[]>(signoffs);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setOptimisticSignoffs(signoffs);
  }, [signoffs]);

  const isAdmin = myProfileRole === "admin";

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
        ...(isAdmin && { signerRole: submittingRole }),
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
        <div className="bg-green-500/5 border border-green-500/20 rounded-lg px-3 py-2.5 flex items-center gap-2">
          <span className="text-green-400 text-xs">✓</span>
          <p className="text-[11px] text-green-400">All 3 sign-offs received — advancing to Handoff</p>
        </div>
      )}
      {anyRejected && !allSigned && (
        <div className="bg-red-500/5 border border-red-500/20 rounded-lg px-3 py-2.5">
          <p className="text-[11px] text-red-400">Validation rejected — design needs revision before re-submission</p>
        </div>
      )}

      {loading ? (
        <div className="flex items-center gap-2 py-2">
          <div className="w-3 h-3 border border-[var(--border-strong)] border-t-transparent rounded-full animate-spin" />
          <span className="text-xs text-[var(--text-tertiary)]">Loading sign-offs...</span>
        </div>
      ) : (
        <>
          {/* 3-row sign-off table */}
          <div className="border border-[var(--border)] rounded-xl overflow-hidden divide-y divide-[var(--border)]">
            {ROLES.map((role) => {
              const signoff = optimisticSignoffs.find((s) => s.signerRole === role.key);
              const isMyRole = mySignerRole === role.key;
              // Admins can act for any role
              const canAct = isMyRole || isAdmin;
              const isActiveRow = activeRole === role.key || (!activeRole && isMyRole && !isAdmin);

              return (
                <div key={role.key} className="px-4 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-medium text-[var(--text-primary)]">{role.label}</span>
                        {isMyRole && (
                          <span className="text-[10px] text-[#D4A84B] bg-[#D4A84B]/10 border border-[#D4A84B]/20 rounded px-1.5 py-0.5">you</span>
                        )}
                      </div>
                      <p className="text-[11px] text-[var(--text-tertiary)] mt-0.5">{role.desc}</p>
                      {signoff?.conditions && (
                        <p className="text-[11px] text-amber-400/80 mt-1 italic">Conditions: {signoff.conditions}</p>
                      )}
                    </div>

                    {/* Status */}
                    <div className="shrink-0">
                      {signoff ? (
                        <span className={`text-[10px] px-2 py-0.5 rounded border font-medium ${decisionStyles[signoff.decision]}`}>
                          {decisionLabels[signoff.decision]}
                        </span>
                      ) : (
                        <span className="text-[10px] text-[var(--text-tertiary)] bg-[var(--bg-subtle)] border border-[var(--border)] rounded px-2 py-0.5">Pending</span>
                      )}
                    </div>
                  </div>

                  {/* Action buttons — shown for current user's role, or all roles if admin */}
                  {canAct && !allSigned && (
                    <div className="mt-3 space-y-2">
                      {/* Decision buttons */}
                      <div className="flex gap-1.5 flex-wrap">
                        {(["approved", "approved_with_conditions", "rejected"] as Decision[]).map((d) => (
                          <button
                            key={d}
                            onClick={() => {
                              setActiveRole(role.key);
                              setActiveDecision(activeDecision === d && isActiveRow ? null : d);
                            }}
                            className={`text-[11px] px-2.5 py-1 rounded border transition-colors ${
                              activeDecision === d && isActiveRow
                                ? d === "approved"
                                  ? "bg-green-500/15 border-green-500/30 text-green-400"
                                  : d === "approved_with_conditions"
                                  ? "bg-amber-500/15 border-amber-500/30 text-amber-400"
                                  : "bg-red-500/15 border-red-500/30 text-red-400"
                                : "border-[var(--border)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--border-strong)]"
                            }`}
                          >
                            {d === "approved" ? "Approve" : d === "approved_with_conditions" ? "Approve with conditions" : "Reject"}
                          </button>
                        ))}
                      </div>

                      {/* Conditions input */}
                      {activeDecision === "approved_with_conditions" && isActiveRow && (
                        <input
                          type="text"
                          value={conditions}
                          onChange={(e) => setConditions(e.target.value)}
                          placeholder="Describe the conditions..."
                          className="w-full bg-[var(--bg-subtle)] border border-[var(--border)] rounded-lg px-3 py-1.5 text-xs text-[var(--text-primary)] placeholder-[var(--text-tertiary)] focus:outline-none focus:border-[var(--border-strong)] transition-colors"
                        />
                      )}

                      {/* Rejection reason */}
                      {activeDecision === "rejected" && isActiveRow && (
                        <input
                          type="text"
                          value={commentText}
                          onChange={(e) => setCommentText(e.target.value)}
                          placeholder="Reason for rejection..."
                          className="w-full bg-[var(--bg-subtle)] border border-[var(--border)] rounded-lg px-3 py-1.5 text-xs text-[var(--text-primary)] placeholder-[var(--text-tertiary)] focus:outline-none focus:border-[var(--border-strong)] transition-colors"
                        />
                      )}

                      {/* Submit */}
                      {activeDecision && isActiveRow && (
                        <button
                          onClick={handleSubmit}
                          disabled={activeDecision === "approved_with_conditions" && !conditions.trim()}
                          className={`text-[11px] px-3 py-1.5 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                            activeDecision === "rejected"
                              ? "bg-red-600 hover:bg-red-500 text-white"
                              : "bg-[var(--accent)] hover:opacity-90 text-[var(--accent-text)]"
                          }`}
                        >
                          Confirm
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Progress summary */}
          <p className="text-[10px] text-[var(--text-tertiary)] text-center">
            {signoffs.filter((s) => s.decision !== "rejected").length} / 3 approvals received
          </p>
        </>
      )}

      {error && (
        <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{error}</p>
      )}
    </div>
  );
}
