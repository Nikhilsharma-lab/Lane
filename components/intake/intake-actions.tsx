"use client";

import { useState, useTransition } from "react";
import { Check, X, Link2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { SnoozePopover } from "@/components/ui/snooze-popover";
import { advanceToContext, declineRequest, snoozeRequest } from "@/app/actions/requests";

interface IntakeActionsProps {
  requestId: string;
}

export function IntakeActions({ requestId }: IntakeActionsProps) {
  const [declining, setDeclining] = useState(false);
  const [declineReason, setDeclineReason] = useState("");
  const [isPendingAccept, startAccept] = useTransition();
  const [isPendingDecline, startDecline] = useTransition();
  const [isPendingSnooze, startSnooze] = useTransition();

  function handleAccept() {
    startAccept(async () => {
      await advanceToContext(requestId);
    });
  }

  function handleDeclineConfirm() {
    if (!declineReason.trim()) return;
    startDecline(async () => {
      await declineRequest(requestId, declineReason.trim());
      setDeclining(false);
      setDeclineReason("");
    });
  }

  function handleSnooze(until: Date) {
    startSnooze(async () => {
      await snoozeRequest(requestId, until.toISOString());
    });
  }

  return (
    <div className="flex flex-col gap-2 pt-4 border-t">
      {/* Primary action row */}
      <div className="flex items-center gap-1.5">
        {/* Accept */}
        <Button
          onClick={handleAccept}
          disabled={isPendingAccept}
          size="sm"
          className="gap-1.5 font-mono"
        >
          <Check className="size-3.5" />
          {isPendingAccept ? "Accepting..." : "Accept"}
        </Button>

        {/* Decline */}
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5 font-mono"
          onClick={() => setDeclining(!declining)}
          disabled={isPendingDecline}
        >
          <X className="size-3.5" />
          {isPendingDecline ? "Declining..." : "Decline"}
        </Button>

        {/* Snooze */}
        <SnoozePopover onSnooze={handleSnooze} label={isPendingSnooze ? "Snoozing..." : "Snooze"} />

        {/* Duplicate placeholder */}
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5 font-mono"
          disabled
        >
          <Link2 className="size-3.5" />
          Duplicate
        </Button>
      </div>

      {/* Inline decline reason */}
      {declining && (
        <div className="flex gap-1.5 items-center">
          <Input
            value={declineReason}
            onChange={(e) => setDeclineReason(e.target.value)}
            placeholder="Reason for declining..."
            autoFocus
            onKeyDown={(e) => {
              if (e.key === "Enter") handleDeclineConfirm();
              if (e.key === "Escape") {
                setDeclining(false);
                setDeclineReason("");
              }
            }}
            className="flex-1 h-7 text-xs"
          />
          <Button
            size="sm"
            variant={declineReason.trim() ? "destructive" : "secondary"}
            className="font-mono text-[11px]"
            onClick={handleDeclineConfirm}
            disabled={!declineReason.trim() || isPendingDecline}
          >
            Confirm
          </Button>
        </div>
      )}
    </div>
  );
}
