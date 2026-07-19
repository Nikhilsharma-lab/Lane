"use client";

import { useState, useTransition } from "react";
import {
  AlertTriangle,
  CopyIcon,
  MoreHorizontalIcon,
  RefreshCwIcon,
  Trash2Icon,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Feedback, type FeedbackKind } from "@/components/ui/feedback";
import { IdentityMark } from "@/components/ui/identity-mark";
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
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Row,
  RowActions,
  RowContent,
  RowDescription,
  RowLeading,
  RowTitle,
} from "@/components/ui/row";
import { revokeInvite, resendInvite } from "./actions";

const WORKSPACE_ROLE_LABELS: Record<string, string> = {
  owner: "Owner",
  admin: "Admin",
  member: "Member",
  guest: "Guest",
};

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
  const [feedback, setFeedback] = useState<{
    message: string;
    kind: Extract<FeedbackKind, "error" | "success">;
  } | null>(null);
  const [revokeOpen, setRevokeOpen] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(invite.inviteUrl);
      setFeedback({ message: "Invite link copied", kind: "success" });
    } catch {
      setFeedback({
        message: "Copy failed. Select and copy the link manually.",
        kind: "error",
      });
    }
    setTimeout(() => setFeedback(null), 3000);
  }

  function handleResend() {
    startTransition(async () => {
      const result = await resendInvite(invite.id, context);
      if ("error" in result && result.error) {
        setFeedback({ message: result.error, kind: "error" });
      } else if (result.emailSent) {
        setFeedback({ message: "Invitation emailed", kind: "success" });
      } else {
        setFeedback({
          message: "Email could not be sent · link is still active",
          kind: "error",
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
    <Row className="items-start py-3">
      <RowLeading className="self-start pt-0.5">
        <IdentityMark label={invite.email} kind="invite" />
      </RowLeading>
      <RowContent>
        <RowTitle className="truncate">{invite.email}</RowTitle>
        <RowDescription>
          {WORKSPACE_ROLE_LABELS[invite.role] ?? invite.role}
          {" · "}
          {expired ? (
            <span className="font-medium text-destructive">Expired</span>
          ) : (
            <>Expires {new Date(invite.expiresAt).toLocaleDateString("en-US")}</>
          )}
        </RowDescription>
        {feedback && (
          <div className="mt-1.5">
            <Feedback kind={feedback.kind} variant="inline">
              {feedback.message}
            </Feedback>
          </div>
        )}
      </RowContent>
      <RowActions className="w-32 self-start">
        {canManage ? (
          <>
            <Badge variant="outline" className="tracking-[0.04em]">
              {expired ? "EXPIRED" : "PENDING"}
            </Badge>
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`More actions for invite to ${invite.email}`}
                  />
                }
                disabled={isPending}
              >
                <MoreHorizontalIcon aria-hidden="true" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" sideOffset={6}>
                <DropdownMenuItem onClick={() => void handleCopy()}>
                  <CopyIcon aria-hidden="true" />
                  Copy invite link
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleResend}>
                  <RefreshCwIcon aria-hidden="true" />
                  Resend email
                </DropdownMenuItem>
                <DropdownMenuItem
                  variant="destructive"
                  onClick={() => setRevokeOpen(true)}
                >
                  <Trash2Icon aria-hidden="true" />
                  Revoke invite
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        ) : (
          <Badge variant="outline">Pending</Badge>
        )}
      </RowActions>
      <AlertDialog open={revokeOpen} onOpenChange={setRevokeOpen}>
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
    </Row>
  );
}
