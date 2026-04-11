"use client";

import { useState, useTransition } from "react";
import { Check, X, Link2 } from "lucide-react";
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
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 8,
        padding: "16px 0 0",
        borderTop: "1px solid hsl(var(--border))",
      }}
    >
      {/* Primary action row */}
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        {/* Accept */}
        <button
          onClick={handleAccept}
          disabled={isPendingAccept}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 5,
            height: 30,
            padding: "0 12px",
            borderRadius: 5,
            fontSize: 12,
            fontFamily: "'Geist Mono', monospace",
            fontWeight: 600,
            background: "hsl(var(--primary))",
            color: "#fff",
            border: "none",
            cursor: isPendingAccept ? "wait" : "pointer",
            opacity: isPendingAccept ? 0.6 : 1,
            transition: "opacity 0.1s",
          }}
        >
          <Check size={13} />
          {isPendingAccept ? "Accepting..." : "Accept"}
        </button>

        {/* Decline */}
        <button
          onClick={() => setDeclining(!declining)}
          disabled={isPendingDecline}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 5,
            height: 30,
            padding: "0 10px",
            borderRadius: 5,
            fontSize: 12,
            fontFamily: "'Geist Mono', monospace",
            fontWeight: 500,
            background: "hsl(var(--muted))",
            color: "hsl(var(--muted-foreground))",
            border: "1px solid hsl(var(--border))",
            cursor: isPendingDecline ? "wait" : "pointer",
            opacity: isPendingDecline ? 0.6 : 1,
          }}
        >
          <X size={13} />
          {isPendingDecline ? "Declining..." : "Decline"}
        </button>

        {/* Snooze */}
        <SnoozePopover onSnooze={handleSnooze} label={isPendingSnooze ? "Snoozing..." : "Snooze"} />

        {/* Duplicate placeholder */}
        <button
          disabled
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 5,
            height: 30,
            padding: "0 10px",
            borderRadius: 5,
            fontSize: 12,
            fontFamily: "'Geist Mono', monospace",
            fontWeight: 500,
            background: "hsl(var(--muted))",
            color: "hsl(var(--muted-foreground) / 0.6)",
            border: "1px solid hsl(var(--border))",
            cursor: "default",
            opacity: 0.5,
          }}
        >
          <Link2 size={13} />
          Duplicate
        </button>
      </div>

      {/* Inline decline reason */}
      {declining && (
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <input
            type="text"
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
            style={{
              flex: 1,
              height: 30,
              padding: "0 8px",
              borderRadius: 5,
              border: "1px solid hsl(var(--border))",
              background: "hsl(var(--muted))",
              fontSize: 12,
              fontFamily: "'Geist', sans-serif",
              color: "hsl(var(--foreground))",
              outline: "none",
            }}
          />
          <button
            onClick={handleDeclineConfirm}
            disabled={!declineReason.trim() || isPendingDecline}
            style={{
              height: 30,
              padding: "0 10px",
              borderRadius: 5,
              fontSize: 11,
              fontFamily: "'Geist Mono', monospace",
              fontWeight: 600,
              background: declineReason.trim() ? "#c53030" : "hsl(var(--accent))",
              color: declineReason.trim() ? "#fff" : "hsl(var(--muted-foreground) / 0.6)",
              border: "none",
              cursor: declineReason.trim() ? "pointer" : "default",
            }}
          >
            Confirm
          </button>
        </div>
      )}
    </div>
  );
}
