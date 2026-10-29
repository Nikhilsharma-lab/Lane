"use client";

import { useRef, useState } from "react";
import { Alert } from "@/components/arc/alert/alert";
import { RadioGroup } from "@/components/arc/radio-group/radio-group";
import { callAction } from "@/lib/action-call";
import { thrownMessage } from "@/lib/failure-messages";
import { DELIVERY_CHOICES, type DeliveryChoice } from "@/lib/delivery-preference-rules";
import styles from "./settings.module.css";

type SaveChoice = (choice: DeliveryChoice) => Promise<{ error?: string; success?: boolean }>;

const isChoice = (value: string): value is DeliveryChoice => (DELIVERY_CHOICES as readonly string[]).includes(value);
const FAILED = "Couldn’t save your choice. Try again.";
const SAVED: Record<DeliveryChoice, string> = {
  email: "Saved. Items that need you reach you by email.",
  slack: "Saved. Items that need you reach you as Slack DMs.",
  off: "Saved. Only Result due reaches you by email.",
};

/**
 * #206 Settings → Inbox delivery: Email (the default), Slack DM (#207, only while an Admin has Slack connected)
 * or Off for this workspace, saved as soon as it changes. The result is confirmed in place, in a polite status
 * line; a failure puts the saved choice back and says why. Someone who chose Slack DM while Slack is not
 * connected sees Email chosen, with a note saying so.
 */
export function InboxDeliveryForm({ initialChoice, email, onSave, slackOffered = false, choseSlack = false }: {
  initialChoice: DeliveryChoice; email: string; onSave: SaveChoice; slackOffered?: boolean; choseSlack?: boolean;
}) {
  const [choice, setChoice] = useState<DeliveryChoice>(initialChoice);
  const [status, setStatus] = useState("");
  const [error, setError] = useState<string | null>(null);
  const confirmed = useRef<DeliveryChoice>(initialChoice);
  const turn = useRef(0);

  async function change(value: string) {
    if (!isChoice(value) || value === choice) return;
    const mine = ++turn.current;
    setChoice(value);
    setError(null);
    setStatus("");
    let message: string | null = null;
    try {
      const result = await callAction(() => onSave(value));
      if (result.error || !result.success) message = result.error || FAILED;
    } catch (thrown) {
      message = thrownMessage(thrown, FAILED);
    }
    // A later choice owns the screen.
    if (mine !== turn.current) return;
    if (message === null) {
      confirmed.current = value;
      setStatus(SAVED[value]);
      return;
    }
    setChoice(confirmed.current);
    setStatus("");
    setError(message);
  }

  const options = [
    { value: "email", label: "Email", description: `One email for each item that needs you, sent to ${email || "your sign-in address"}.` },
    ...(slackOffered ? [{ value: "slack", label: "Slack DM", description: "One Slack message for each item that needs you, from Lane in your workspace’s Slack. If Slack can’t find you by this address, it comes by email." }] : []),
    { value: "off", label: "Off", description: "Nothing is emailed, except Result due, so a result is never missed." },
  ];

  return <div className={styles.card}>
    <div className={styles.cardBody}>
      <h3>Needs-you items</h3>
      <p>A review asked of you, a Concern on your Request, Record the release and Result due. Each arrives once, on its own, with a link to the Request. For your information items stay in Lane.</p>
      <RadioGroup label="Deliver Needs-you items" value={choice} onValueChange={value => { void change(value); }} options={options} />
      {choseSlack && !slackOffered && choice === "email" && <p className={styles.note}>You chose Slack DM, but Slack isn’t connected to this workspace now, so items reach you by email.</p>}
      {error && <Alert role="alert" tone="danger" title={error} />}
    </div>
    <div className={styles.cardFooter}>
      <span>Saved as soon as you choose, for this workspace only.</span>
      <p role="status" className={styles.feedback}>{status}</p>
    </div>
  </div>;
}
