"use client";

import { useRef, useState } from "react";
import { Alert } from "@/components/arc/alert/alert";
import { RadioGroup } from "@/components/arc/radio-group/radio-group";
import { callAction } from "@/lib/action-call";
import { DELIVERY_CHOICES, type DeliveryChoice } from "@/lib/delivery-preference-rules";
import styles from "./settings.module.css";

type SaveChoice = (choice: DeliveryChoice) => Promise<{ error?: string; success?: boolean }>;

const isChoice = (value: string): value is DeliveryChoice => (DELIVERY_CHOICES as readonly string[]).includes(value);
const FAILED = "Couldn’t save your choice. Try again.";
const SAVED: Record<DeliveryChoice, string> = {
  email: "Saved. Items that need you reach you by email.",
  off: "Saved. Only Result due reaches you by email.",
};

/**
 * #206 Settings → Inbox delivery: Email (the default) or Off for this workspace, saved as soon as it changes.
 * The result is confirmed in place, in a polite status line; a failure puts the saved choice back and says why.
 * Slack DM joins the choices once an Admin connects Slack (#207).
 */
export function InboxDeliveryForm({ initialChoice, email, onSave }: { initialChoice: DeliveryChoice; email: string; onSave: SaveChoice }) {
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
    setStatus("Saving…");
    let message: string | null = null;
    try {
      const result = await callAction(() => onSave(value));
      if (result.error || !result.success) message = result.error || FAILED;
    } catch {
      message = FAILED;
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
    { value: "off", label: "Off", description: "Nothing is emailed, except Result due, so a result is never missed." },
  ];

  return <div className={styles.card}>
    <div className={styles.cardBody}>
      <h3>Email</h3>
      <p>A review asked of you, a Concern on your Request, Record the release and Result due. Each arrives once, on its own, with a link to the Request. For your information items stay in Lane.</p>
      <RadioGroup label="Deliver Needs-you items" value={choice} onValueChange={value => { void change(value); }} options={options} />
      {error && <Alert role="alert" tone="danger" title={error} />}
    </div>
    <div className={styles.cardFooter}>
      <span>Saved as soon as you choose, for this workspace only.</span>
      <p role="status" className={styles.feedback}>{status}</p>
    </div>
  </div>;
}
