"use client";

import { useState, useTransition } from "react";
import { revokeInvite } from "@/app/actions/settings";

interface Invite { id: string; email: string; role: string; expiresAt: Date; acceptedAt: Date | null; }
interface Props { invites: Invite[]; isAdmin: boolean; }

const ROLE_LABELS: Record<string, string> = { pm: "PM", designer: "Designer", developer: "Developer", lead: "Lead", admin: "Admin" };

function isExpired(date: Date) { return new Date() > new Date(date); }
function formatDate(date: Date) { return new Date(date).toLocaleDateString("en-US", { month: "short", day: "numeric" }); }

export function PendingInvites({ invites, isAdmin }: Props) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const active = invites.filter((i) => !i.acceptedAt && !isExpired(i.expiresAt));
  const expired = invites.filter((i) => !i.acceptedAt && isExpired(i.expiresAt));
  if (active.length === 0 && expired.length === 0) return null;

  function handleRevoke(inviteId: string) {
    startTransition(async () => {
      const result = await revokeInvite(inviteId);
      if (result?.error) setError(result.error);
    });
  }

  return (
    <div className="space-y-6">
      {error && <p className="text-sm text-red-400 mb-3">{error}</p>}
      {active.length > 0 && (
        <div>
          <h2 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-3">Pending invites ({active.length})</h2>
          <div className="space-y-2">
            {active.map((inv) => (
              <div key={inv.id} className="flex items-center justify-between border border-border rounded-xl px-5 py-3">
                <div>
                  <p className="text-sm text-foreground">{inv.email}</p>
                  <p className="text-xs text-muted-foreground/60">{ROLE_LABELS[inv.role] ?? inv.role} &middot; Expires {formatDate(inv.expiresAt)}</p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-yellow-500/70">Pending</span>
                  {isAdmin && <button onClick={() => handleRevoke(inv.id)} disabled={isPending} className="text-xs text-muted-foreground/60 hover:text-red-400 transition-colors disabled:opacity-40">Revoke</button>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      {expired.length > 0 && (
        <div>
          <h2 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-3">Expired invites ({expired.length})</h2>
          <div className="space-y-2 opacity-50">
            {expired.map((inv) => (
              <div key={inv.id} className="flex items-center justify-between border border-border rounded-xl px-5 py-3">
                <div>
                  <p className="text-sm text-muted-foreground">{inv.email}</p>
                  <p className="text-xs text-muted-foreground/60">{ROLE_LABELS[inv.role] ?? inv.role} &middot; Expired {formatDate(inv.expiresAt)}</p>
                </div>
                <span className="text-xs text-muted-foreground/60">Expired</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
