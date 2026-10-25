"use client";

import { useState } from "react";
import { Alert } from "@/components/arc/alert/alert";
import { Button } from "@/components/arc/button/button";
import { Dialog, DialogClose, DialogContent } from "@/components/arc/dialog/dialog";
import { callAction } from "@/lib/action-call";
import styles from "./settings.module.css";

/** How the round trip through Slack's install page ended (`GET /api/slack/callback` puts it in the URL). */
export type SlackConnectResult = "connected" | "cancelled" | "expired" | "refused" | "failed" | "unavailable";

export type SlackConnectionState =
  | { kind: "unavailable" }
  | { kind: "disconnected" }
  /** `available` is false while Slack is switched off in Lane: the saved connection is not used. */
  | { kind: "connected"; teamName: string; connectedByName: string | null; connectedOn: string; available: boolean };

export type SlackConnectionCardProps = {
  connection: SlackConnectionState;
  result?: SlackConnectResult;
  onConnect: () => Promise<{ ok?: true; url?: string; error?: string }>;
  onDisconnect: () => Promise<{ success?: boolean; error?: string }>;
};

const RETURN_PROBLEMS: Partial<Record<SlackConnectResult, string>> = {
  cancelled: "Slack wasn’t connected: the install was cancelled in Slack.",
  expired: "That Slack link expired. Connect Slack again.",
  refused: "Only the Admin who started connecting Slack can finish it.",
  failed: "Slack didn’t finish connecting. Try again.",
};
const FAILED = "Couldn’t reach Lane. Try again.";

/**
 * #207 Settings → Slack, for Admins. Connect sends the Admin to Slack's install page (Slack's standard flow) and
 * Slack brings them back here; Disconnect asks first, then removes the connection. Results are confirmed in
 * place: a polite status line, or an alert for a problem. While Slack isn't available in Lane there is no button.
 */
export function SlackConnectionCard({ connection, result, onConnect, onDisconnect }: SlackConnectionCardProps) {
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState(result === "connected" ? "Slack is connected. People here can now choose Slack DM under Inbox delivery." : "");
  const problem = error ?? (status ? null : RETURN_PROBLEMS[result ?? "connected"] ?? null);

  async function connect() {
    setBusy(true);
    setError(null);
    setStatus("Opening Slack…");
    try {
      const answer = await callAction(() => onConnect());
      if (answer.url) {
        window.location.assign(answer.url);
        return;
      }
      setError(answer.error || FAILED);
    } catch {
      setError(FAILED);
    }
    setStatus("");
    setBusy(false);
  }

  async function disconnect() {
    setBusy(true);
    setError(null);
    try {
      const answer = await callAction(() => onDisconnect());
      if (answer.success) {
        setConfirming(false);
        setStatus("Slack is disconnected. People who chose Slack DM get email instead.");
      } else setError(answer.error || FAILED);
    } catch {
      setError(FAILED);
    }
    setBusy(false);
  }

  const action = connection.kind === "disconnected"
    ? <Button onClick={() => { void connect(); }} loading={busy}>Connect Slack</Button>
    : connection.kind === "connected"
      ? <Button variant="secondary" onClick={() => { setError(null); setConfirming(true); }}>Disconnect Slack</Button>
      : null;

  return <div className={styles.card}>
    <div className={styles.cardBody}>
      <h3>Slack DMs</h3>
      {connection.kind === "unavailable" && <p>Slack isn’t available in Lane yet. Once it is, an Admin can connect your Slack workspace here, and people can then choose Slack DM under Inbox delivery.</p>}
      {connection.kind === "disconnected" && <p>Connect your Slack workspace so people here can choose Slack DM for items that need them. Lane only sends those DMs, and finds people by their email address.</p>}
      {connection.kind === "connected" && <>
        <p>People here can choose Slack DM for items that need them. Disconnecting sends those items by email instead.</p>
        <div className={styles.rows}>
          <div className={styles.row}><strong>Slack workspace</strong><span className={styles.value}>{connection.teamName}</span></div>
          <div className={styles.row}><strong>Connected</strong><span className={styles.value}>{connection.connectedByName ? `By ${connection.connectedByName} on ${connection.connectedOn}` : `On ${connection.connectedOn}`}</span></div>
        </div>
        {!connection.available && <p className={styles.note}>Slack DMs are switched off in Lane right now, so items go by email.</p>}
      </>}
      {problem && <Alert role="alert" tone={result === "cancelled" && !error ? "warning" : "danger"} title={problem} />}
    </div>
    <div className={styles.cardFooter}>
      <div>
        <span>{connection.kind === "disconnected" ? "You’ll approve it in Slack, then come back here." : "One connection for this workspace, managed by Admins."}</span>
        <p role="status" className={styles.feedback}>{status}</p>
      </div>
      {action}
    </div>
    <Dialog open={confirming} onOpenChange={open => { if (!busy) setConfirming(open); }}>
      {confirming && <DialogContent title="Disconnect Slack?" description="People who chose Slack DM get email instead. They can choose Slack DM again once Slack is connected.">
        {error && <Alert role="alert" tone="danger" title={error} />}
        <div className={styles.dialogActions}>
          <DialogClose asChild><Button variant="ghost" disabled={busy}>Cancel</Button></DialogClose>
          <Button variant="danger" onClick={() => { void disconnect(); }} loading={busy}>Disconnect Slack</Button>
        </div>
      </DialogContent>}
    </Dialog>
  </div>;
}
