"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";

interface Member {
  id: string;
  fullName: string;
  role: string;
  email: string;
}

interface Assignment {
  id: string;
  assigneeId: string;
  role: string;
}

interface Recommendation {
  recommendedId: string | null;
  reasoning: string;
}

const roleColors: Record<string, string> = {
  lead: "text-[#7DA5C4] bg-[#7DA5C4]/10 border-[#7DA5C4]/20",
  reviewer: "text-[#A394C7] bg-[#A394C7]/10 border-[#A394C7]/20",
  contributor: "text-muted-foreground/60 bg-accent border",
};

const assignmentRoles = ["lead", "reviewer", "contributor"] as const;

interface Props {
  requestId: string;
}

export function AssignPanel({ requestId }: Props) {
  const router = useRouter();
  const [members, setMembers] = useState<Member[]>([]);
  const [currentAssignments, setCurrentAssignments] = useState<Assignment[]>([]);
  const [workloads, setWorkloads] = useState<Record<string, number>>({});
  const [recommendation, setRecommendation] = useState<Recommendation | null>(null);
  const [loadingRec, setLoadingRec] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showPicker, setShowPicker] = useState(false);
  const [selectedRole, setSelectedRole] = useState<"lead" | "reviewer" | "contributor">("lead");

  const load = useCallback(async () => {
    const res = await fetch(`/api/requests/${requestId}/assign`);
    if (res.ok) {
      const data = await res.json();
      setMembers(data.members);
      setCurrentAssignments(data.assignments);
      setWorkloads(data.workloads ?? {});
    }
    setLoading(false);
  }, [requestId]);

  useEffect(() => { load(); }, [load]);

  // Fetch AI recommendation when picker opens
  useEffect(() => {
    if (!showPicker || recommendation) return;
    setLoadingRec(true);
    fetch(`/api/requests/${requestId}/assign-recommend`)
      .then((r) => r.json())
      .then((data) => { setRecommendation(data); setLoadingRec(false); })
      .catch(() => setLoadingRec(false));
  }, [showPicker, requestId, recommendation]);

  async function assign(memberId: string) {
    const member = members.find((m) => m.id === memberId);
    if (!member) return;

    // Optimistic: immediately show as assigned
    const tempAssignment = { id: `temp-${memberId}`, assigneeId: memberId, role: selectedRole };
    setCurrentAssignments((prev) => [...prev, tempAssignment]);
    setShowPicker(false);

    const res = await fetch(`/api/requests/${requestId}/assign`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ assigneeId: memberId, role: selectedRole }),
    });

    if (!res.ok) {
      // Rollback
      setCurrentAssignments((prev) => prev.filter((a) => a.id !== `temp-${memberId}`));
      return;
    }

    setRecommendation(null);
    await load();
    router.refresh();
  }

  async function unassign(memberId: string) {
    // Optimistic: immediately remove
    const previous = currentAssignments;
    setCurrentAssignments((prev) => prev.filter((a) => a.assigneeId !== memberId));

    const res = await fetch(`/api/requests/${requestId}/assign`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ assigneeId: memberId }),
    });

    if (!res.ok) {
      // Rollback
      setCurrentAssignments(previous);
      return;
    }

    await load();
    router.refresh();
  }

  const assignedIds = new Set(currentAssignments.map((a) => a.assigneeId));
  const assignedMembers = members.filter((m) => assignedIds.has(m.id));
  const unassignedMembers = members.filter((m) => !assignedIds.has(m.id));

  if (loading) return <div className="text-xs text-muted-foreground/60 py-2">Loading…</div>;

  return (
    <div>
      {/* Current assignees */}
      {assignedMembers.length > 0 ? (
        <div className="space-y-2 mb-3">
          {assignedMembers.map((m) => {
            const assignment = currentAssignments.find((a) => a.assigneeId === m.id);
            return (
              <div key={m.id} className="flex items-center justify-between gap-2 group">
                <div className="flex items-center gap-2 min-w-0">
                  <Avatar name={m.fullName} />
                  <div className="min-w-0">
                    <p className="text-sm text-foreground truncate">{m.fullName}</p>
                    <p className="text-[10px] text-muted-foreground/60 capitalize">{m.role}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className={`text-[10px] px-1.5 py-0.5 rounded border ${roleColors[assignment?.role ?? "lead"]}`}>
                    {assignment?.role ?? "lead"}
                  </span>
                  <button
                    onClick={() => unassign(m.id)}
                    className="text-muted-foreground/60 hover:text-red-400 text-xs opacity-0 group-hover:opacity-100 transition-all"
                  >
                    ✕
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground/60 mb-3">No one assigned yet</p>
      )}

      {/* Assign button / picker */}
      {!showPicker ? (
        <button
          onClick={() => setShowPicker(true)}
          className="text-xs text-muted-foreground hover:text-foreground border border hover:border-border/80 rounded-lg px-3 py-1.5 transition-colors w-full"
        >
          + Assign someone
        </button>
      ) : (
        <div className="border rounded-xl overflow-hidden">
          {/* AI recommendation */}
          {loadingRec ? (
            <div className="px-3 py-2.5 border-b bg-muted flex items-center gap-2">
              <span className="w-2.5 h-2.5 border-2 border-border/80 border-t-[#D4A84B] rounded-full animate-spin" />
              <span className="text-[10px] text-muted-foreground/60">Getting AI recommendation…</span>
            </div>
          ) : recommendation?.recommendedId ? (
            <div className="px-3 py-2.5 border-b bg-primary/10">
              <div className="flex items-center gap-1.5 mb-0.5">
                <span className="text-[10px] text-primary font-medium uppercase tracking-wide">✦ AI pick</span>
              </div>
              <p className="text-xs text-foreground">
                <span className="font-medium">
                  {members.find((m) => m.id === recommendation.recommendedId)?.fullName ?? "—"}
                </span>
                {" "}— {recommendation.reasoning}
              </p>
            </div>
          ) : null}

          {/* Role picker */}
          <div className="flex border-b">
            {assignmentRoles.map((r) => (
              <button
                key={r}
                onClick={() => setSelectedRole(r)}
                className={`flex-1 text-[10px] py-2 capitalize transition-colors ${
                  selectedRole === r ? "bg-accent text-foreground" : "text-muted-foreground/60 hover:text-muted-foreground"
                }`}
              >
                {r}
              </button>
            ))}
          </div>

          {/* Member list with workload */}
          <div className="max-h-52 overflow-y-auto">
            {unassignedMembers.length === 0 ? (
              <p className="text-xs text-muted-foreground/60 px-3 py-3 text-center">Everyone is assigned</p>
            ) : (
              unassignedMembers.map((m) => {
                const load_ = workloads[m.id] ?? 0;
                const isRecommended = recommendation?.recommendedId === m.id;
                return (
                  <button
                    key={m.id}
                    onClick={() => assign(m.id)}
                    className={`w-full flex items-center gap-2.5 px-3 py-2.5 hover:bg-accent transition-colors text-left ${
                      isRecommended ? "bg-primary/10" : ""
                    }`}
                  >
                    <Avatar name={m.fullName} highlighted={isRecommended} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <p className="text-sm text-foreground truncate">{m.fullName}</p>
                        {isRecommended && (
                          <span className="text-[9px] text-primary bg-primary/10 px-1 py-0.5 rounded">AI pick</span>
                        )}
                      </div>
                      <p className="text-[10px] text-muted-foreground/60 capitalize">{m.role}</p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-[10px] text-muted-foreground/60">{load_} active</p>
                    </div>
                  </button>
                );
              })
            )}
          </div>

          <div className="border-t px-3 py-2">
            <button
              onClick={() => setShowPicker(false)}
              className="text-xs text-muted-foreground/60 hover:text-muted-foreground transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Avatar({ name, highlighted }: { name: string; highlighted?: boolean }) {
  const initials = name.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();
  return (
    <div className={`w-6 h-6 rounded-full border flex items-center justify-center text-[9px] font-medium shrink-0 ${
      highlighted
        ? "bg-primary/10 border-primary/30 text-primary"
        : "bg-accent border text-muted-foreground"
    }`}>
      {initials}
    </div>
  );
}
