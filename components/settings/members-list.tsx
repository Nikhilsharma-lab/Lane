"use client";

import { useState, useTransition } from "react";
import { updateMemberRole, removeMember } from "@/app/actions/settings";
import { InviteForm } from "@/components/team/invite-form";

const ROLE_LABELS: Record<string, string> = { pm: "PM", designer: "Designer", developer: "Developer", lead: "Lead", admin: "Admin" };
const ROLES = ["pm", "designer", "developer", "lead", "admin"];

interface Member { id: string; fullName: string; email: string; role: string; }
interface Props { members: Member[]; currentUserId: string; isAdmin: boolean; }

export function MembersList({ members, currentUserId, isAdmin }: Props) {
  const [confirmRemoveId, setConfirmRemoveId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleRoleChange(profileId: string, role: string) {
    startTransition(async () => {
      const result = await updateMemberRole(profileId, role);
      if (result?.error) setError(result.error);
    });
  }

  function handleRemove(profileId: string) {
    startTransition(async () => {
      const result = await removeMember(profileId);
      if (result?.error) setError(result.error);
      else setConfirmRemoveId(null);
    });
  }

  return (
    <div className="space-y-8">
      {isAdmin && (
        <div>
          <h2 className="text-xs font-medium text-[var(--text-secondary)] uppercase tracking-wide mb-3">Invite member</h2>
          <InviteForm />
        </div>
      )}
      <div>
        <h2 className="text-xs font-medium text-[var(--text-secondary)] uppercase tracking-wide mb-3">Team ({members.length})</h2>
        {error && <p className="text-sm text-red-400 mb-3">{error}</p>}
        <div className="space-y-2">
          {members.map((m) => (
            <div key={m.id} className="flex items-center justify-between border border-[var(--border)] rounded-xl px-5 py-3">
              <div className="flex items-center gap-3">
                <div className="w-7 h-7 rounded-full bg-[var(--bg-hover)] flex items-center justify-center text-xs font-medium text-[var(--text-secondary)] shrink-0">
                  {m.fullName.charAt(0).toUpperCase()}
                </div>
                <div>
                  <p className="text-sm text-[var(--text-primary)]">{m.fullName}{m.id === currentUserId && <span className="text-xs text-[var(--text-tertiary)] ml-1.5">(you)</span>}</p>
                  <p className="text-xs text-[var(--text-tertiary)]">{m.email}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                {isAdmin && m.id !== currentUserId ? (
                  <select value={m.role} onChange={(e) => handleRoleChange(m.id, e.target.value)} disabled={isPending}
                    className="bg-[var(--bg-subtle)] border border-[var(--border)] rounded px-2 py-1 text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--border-strong)] transition-colors disabled:opacity-40">
                    {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
                  </select>
                ) : (
                  <span className="text-xs text-[var(--text-secondary)] bg-[var(--bg-subtle)] border border-[var(--border)] rounded px-1.5 py-0.5">{ROLE_LABELS[m.role] ?? m.role}</span>
                )}
                {isAdmin && m.id !== currentUserId && (
                  confirmRemoveId === m.id ? (
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs text-[var(--text-secondary)]">Remove?</span>
                      <button onClick={() => handleRemove(m.id)} disabled={isPending} className="text-xs text-red-400 hover:text-red-300 transition-colors disabled:opacity-40">Yes</button>
                      <button onClick={() => setConfirmRemoveId(null)} className="text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors">No</button>
                    </div>
                  ) : (
                    <button onClick={() => setConfirmRemoveId(m.id)} className="text-xs text-[var(--text-tertiary)] hover:text-red-400 transition-colors">Remove</button>
                  )
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
