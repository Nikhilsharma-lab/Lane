"use client";

import { useState, useTransition } from "react";
import { Badge } from "@/components/ui/badge";
import { revokeInvite, resendInvite } from "./actions";

export function InviteRow({
  invite,
  context,
  canManage,
}: {
  invite: {
    id: string;
    email: string;
    role: string;
    inviteUrl: string;
    expiresAt: Date;
  };
  context: { userId: string; orgId: string };
  canManage: boolean;
}) {
  const [isPending, startTransition] = useTransition();
  const [copied, setCopied] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  async function handleCopy() {
    await navigator.clipboard.writeText(invite.inviteUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function handleResend() {
    startTransition(async () => {
      const result = await resendInvite(invite.id, context);
      if ("error" in result && result.error) {
        setFeedback(result.error);
      } else {
        setFeedback("Refreshed!");
      }
      setTimeout(() => setFeedback(null), 3000);
    });
  }

  function handleRevoke() {
    startTransition(async () => {
      await revokeInvite(invite.id, context);
    });
  }

  const expired = new Date(invite.expiresAt) < new Date();

  return (
    <div className="flex items-center justify-between rounded-lg border border-dashed p-4">
      <div>
        <p className="text-sm font-medium">{invite.email}</p>
        <p className="text-xs text-muted-foreground">
          {expired ? (
            <span className="text-destructive/70">Expired</span>
          ) : (
            <>Expires {new Date(invite.expiresAt).toLocaleDateString()}</>
          )}
          {invite.role === "admin" && (
            <>
              {" · "}
              <span className="font-medium">Admin</span>
            </>
          )}
        </p>
        {feedback && <p className="mt-1 text-xs text-brand">{feedback}</p>}
      </div>
      <div className="flex items-center gap-1">
        {canManage ? (
          <>
            <button
              onClick={handleCopy}
              className="rounded px-2 py-1 text-xs text-muted-foreground hover:bg-accent hover:text-accent-foreground"
              disabled={isPending}
            >
              {copied ? "Copied!" : "Copy link"}
            </button>
            <button
              onClick={handleResend}
              className="rounded px-2 py-1 text-xs text-muted-foreground hover:bg-accent hover:text-accent-foreground"
              disabled={isPending}
            >
              Resend
            </button>
            <button
              onClick={handleRevoke}
              className="rounded px-2 py-1 text-xs text-destructive/70 hover:bg-destructive/10 hover:text-destructive"
              disabled={isPending}
            >
              Revoke
            </button>
          </>
        ) : (
          <Badge variant="outline">Pending</Badge>
        )}
      </div>
    </div>
  );
}
