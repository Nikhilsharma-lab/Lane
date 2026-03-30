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

const roleColors: Record<string, string> = {
  lead: "text-blue-400 bg-blue-500/10 border-blue-500/20",
  reviewer: "text-purple-400 bg-purple-500/10 border-purple-500/20",
  contributor: "text-zinc-400 bg-zinc-700/30 border-zinc-700",
};

const assignmentRoles = ["lead", "reviewer", "contributor"] as const;

interface Props {
  requestId: string;
}

export function AssignPanel({ requestId }: Props) {
  const router = useRouter();
  const [members, setMembers] = useState<Member[]>([]);
  const [currentAssignments, setCurrentAssignments] = useState<Assignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [assigning, setAssigning] = useState<string | null>(null);
  const [showPicker, setShowPicker] = useState(false);
  const [selectedRole, setSelectedRole] = useState<"lead" | "reviewer" | "contributor">("lead");

  const load = useCallback(async () => {
    const res = await fetch(`/api/requests/${requestId}/assign`);
    if (res.ok) {
      const data = await res.json();
      setMembers(data.members);
      setCurrentAssignments(data.assignments);
    }
    setLoading(false);
  }, [requestId]);

  useEffect(() => { load(); }, [load]);

  async function assign(memberId: string) {
    setAssigning(memberId);
    await fetch(`/api/requests/${requestId}/assign`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ assigneeId: memberId, role: selectedRole }),
    });
    await load();
    setAssigning(null);
    setShowPicker(false);
    router.refresh();
  }

  async function unassign(memberId: string) {
    setAssigning(memberId);
    await fetch(`/api/requests/${requestId}/assign`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ assigneeId: memberId }),
    });
    await load();
    setAssigning(null);
    router.refresh();
  }

  const assignedIds = new Set(currentAssignments.map((a) => a.assigneeId));
  const assignedMembers = members.filter((m) => assignedIds.has(m.id));
  const unassignedMembers = members.filter((m) => !assignedIds.has(m.id));

  if (loading) {
    return <div className="text-xs text-zinc-600 py-2">Loading…</div>;
  }

  return (
    <div>
      {/* Current assignees */}
      {assignedMembers.length > 0 ? (
        <div className="space-y-2 mb-3">
          {assignedMembers.map((m) => {
            const assignment = currentAssignments.find((a) => a.assigneeId === m.id);
            return (
              <div
                key={m.id}
                className="flex items-center justify-between gap-2 group"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <Avatar name={m.fullName} />
                  <div className="min-w-0">
                    <p className="text-sm text-zinc-300 truncate">{m.fullName}</p>
                    <p className="text-[10px] text-zinc-600 capitalize">{m.role}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className={`text-[10px] px-1.5 py-0.5 rounded border ${roleColors[assignment?.role ?? "lead"]}`}>
                    {assignment?.role ?? "lead"}
                  </span>
                  <button
                    onClick={() => unassign(m.id)}
                    disabled={assigning === m.id}
                    className="text-zinc-700 hover:text-red-400 text-xs opacity-0 group-hover:opacity-100 transition-all"
                  >
                    ✕
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <p className="text-sm text-zinc-600 mb-3">No one assigned yet</p>
      )}

      {/* Assign button */}
      {!showPicker ? (
        <button
          onClick={() => setShowPicker(true)}
          className="text-xs text-zinc-500 hover:text-zinc-300 border border-zinc-800 hover:border-zinc-600 rounded-lg px-3 py-1.5 transition-colors w-full"
        >
          + Assign someone
        </button>
      ) : (
        <div className="border border-zinc-800 rounded-xl overflow-hidden">
          {/* Role picker */}
          <div className="flex border-b border-zinc-800">
            {assignmentRoles.map((r) => (
              <button
                key={r}
                onClick={() => setSelectedRole(r)}
                className={`flex-1 text-[10px] py-2 capitalize transition-colors ${
                  selectedRole === r
                    ? "bg-zinc-800 text-zinc-300"
                    : "text-zinc-600 hover:text-zinc-400"
                }`}
              >
                {r}
              </button>
            ))}
          </div>

          {/* Member list */}
          <div className="max-h-48 overflow-y-auto">
            {unassignedMembers.length === 0 ? (
              <p className="text-xs text-zinc-600 px-3 py-3 text-center">Everyone is assigned</p>
            ) : (
              unassignedMembers.map((m) => (
                <button
                  key={m.id}
                  onClick={() => assign(m.id)}
                  disabled={assigning === m.id}
                  className="w-full flex items-center gap-2.5 px-3 py-2.5 hover:bg-zinc-800/60 transition-colors text-left"
                >
                  <Avatar name={m.fullName} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-zinc-300 truncate">{m.fullName}</p>
                    <p className="text-[10px] text-zinc-600 capitalize">{m.role}</p>
                  </div>
                  {assigning === m.id && (
                    <span className="w-3 h-3 border-2 border-zinc-600 border-t-zinc-300 rounded-full animate-spin" />
                  )}
                </button>
              ))
            )}
          </div>

          <div className="border-t border-zinc-800 px-3 py-2">
            <button
              onClick={() => setShowPicker(false)}
              className="text-xs text-zinc-600 hover:text-zinc-400 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Avatar({ name }: { name: string }) {
  const initials = name
    .split(" ")
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <div className="w-6 h-6 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center text-[9px] text-zinc-400 font-medium shrink-0">
      {initials}
    </div>
  );
}
