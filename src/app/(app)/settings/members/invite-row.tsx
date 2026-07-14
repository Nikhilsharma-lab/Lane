"use client";

import { useState, useTransition } from "react";
import { AlertTriangle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
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
  const [feedback, setFeedback] = useState<{
    message: string;
    error?: boolean;
  } | null>(null);
  const [revokeOpen, setRevokeOpen] = useState(false);

  async function handleCopy() {
    await navigator.clipboard.writeText(invite.inviteUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function handleResend() {
    startTransition(async () => {
      const result = await resendInvite(invite.id, context);
      if ("error" in result && result.error) {
        setFeedback({ message: result.error, error: true });
      } else if (result.emailSent) {
        setFeedback({ message: "Invitation emailed" });
      } else {
        setFeedback({
          message: "Email could not be sent · link is still active",
          error: true,
        });
      }
      setTimeout(() => setFeedback(null), 3000);
    });
  }

  function handleRevoke() {
    startTransition(async () => {
      await revokeInvite(invite.id, context);
      setRevokeOpen(false);
    });
  }

  const expired = new Date(invite.expiresAt) < new Date();

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-dashed p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <p className="text-sm font-medium">{invite.email}</p>
        <p className="text-xs text-muted-foreground">
          {expired ? (
            <span className="text-destructive/70">Expired</span>
          ) : (
            <>Expires {new Date(invite.expiresAt).toLocaleDateString("en-US")}</>
          )}
          {invite.role === "admin" && (
            <>
              {" · "}
              <span className="font-medium">Admin</span>
            </>
          )}
        </p>
        {feedback && (
          <p
            aria-live="polite"
            className={`mt-1 text-xs ${feedback.error ? "text-destructive" : "text-brand"}`}
          >
            {feedback.message}
          </p>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-1 sm:justify-end">
        {canManage ? (
          <>
            <Button
              type="button"
              variant="ghost"
              size="xs"
              onClick={handleCopy}
              className="text-muted-foreground"
              disabled={isPending}
            >
              {copied ? "Copied!" : "Copy link"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="xs"
              onClick={handleResend}
              className="text-muted-foreground"
              disabled={isPending}
            >
              {isPending ? "Sending…" : "Resend email"}
            </Button>
            <AlertDialog open={revokeOpen} onOpenChange={setRevokeOpen}>
              <AlertDialogTrigger
                render={<Button type="button" variant="destructive" size="xs" />}
                disabled={isPending}
              >
                Revoke
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogMedia className="bg-destructive/10">
                    <AlertTriangle className="size-5 text-destructive" />
                  </AlertDialogMedia>
                  <AlertDialogTitle>
                    Revoke invite to {invite.email}?
                  </AlertDialogTitle>
                  <AlertDialogDescription>
                    They will need a new invite to join this workspace.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel disabled={isPending}>
                    Cancel
                  </AlertDialogCancel>
                  <AlertDialogAction
                    variant="destructive"
                    onClick={handleRevoke}
                    disabled={isPending}
                  >
                    {isPending ? "Revoking…" : "Revoke"}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </>
        ) : (
          <Badge variant="outline">Pending</Badge>
        )}
      </div>
    </div>
  );
}
