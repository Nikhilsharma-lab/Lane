"use client";

import dynamic from "next/dynamic";
import { useState, type FormEvent } from "react";
import { Alert } from "@/components/arc/alert/alert";
import { Button } from "@/components/arc/button/button";
import { Input } from "@/components/arc/input/input";
import { RadioGroup } from "@/components/arc/radio-group/radio-group";
import { ROLE_DESCRIPTIONS, type PaidSeatChange } from "@/lib/member-role-rules";
import styles from "./first-run.module.css";

/** #215: loaded only when a paid seat is confirmed, as Settings → Members does. */
const PaidSeatDialog = dynamic(() => import("@/components/settings/paid-seat-dialog").then(module => module.PaidSeatDialog));

export type FirstRunInviteRole = "member" | "viewer";
type Answer = { success?: true; error?: string };

/** A Reviewer is a Member: only paid seats review (#211). A Viewer reads and changes nothing (#210). */
const ROLE_LABELS: Record<FirstRunInviteRole, string> = { member: "Reviewer", viewer: "Viewer" };
const ROLE_NOTES: Record<FirstRunInviteRole, string> = {
  member: `Joins as a Member. ${ROLE_DESCRIPTIONS.member}`,
  viewer: ROLE_DESCRIPTIONS.viewer,
};
const FAILED = "Couldn’t reach Lane. Try again.";

export type FirstRunInviteFormProps = {
  /** Reviewer always; Viewer only while the Viewer role is available (`LANE_CUSTOM_ROLES`). */
  roles: FirstRunInviteRole[];
  /** #215: while billing is enforced, a Reviewer's paid seat is confirmed first. */
  confirmPaidSeats?: boolean;
  onInvite: (email: string, role: FirstRunInviteRole, confirmedPaidSeat?: boolean) => Promise<Answer>;
};

/**
 * #217: an Admin invites teammates from the first run, as Reviewers (Members) or Viewers. Clerk sends the
 * invitation through the same Members action as Settings; Lane stores nothing. A teammate can be picked as a
 * Reviewer once they have joined.
 */
export function FirstRunInviteForm({ roles, confirmPaidSeats = false, onInvite }: FirstRunInviteFormProps) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<FirstRunInviteRole>("member");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ status: string; error: string | null } | null>(null);
  const [seat, setSeat] = useState<{ change: PaidSeatChange; send: () => void } | null>(null);
  const [seatOpen, setSeatOpen] = useState(false);

  async function send(address: string, chosen: FirstRunInviteRole, confirmed: boolean) {
    setBusy(true);
    setResult(null);
    let answer: Answer;
    try { answer = await onInvite(address, chosen, confirmed || undefined); } catch { answer = { error: FAILED }; }
    setBusy(false);
    if (answer.error || !answer.success) { setResult({ status: "", error: answer.error || FAILED }); return; }
    setEmail("");
    setResult({ status: `Invitation sent to ${address} as ${chosen === "member" ? "a Reviewer" : "a Viewer"}.`, error: null });
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    const address = email.trim();
    if (!address) { setResult({ status: "", error: "Enter an email address." }); return; }
    const chosen = role;
    if (confirmPaidSeats && chosen === "member") {
      setSeat({ change: { kind: "invite", email: address, role: "member" }, send: () => void send(address, chosen, true) });
      setSeatOpen(true);
      return;
    }
    void send(address, chosen, false);
  }

  return <form className={styles.invite} onSubmit={submit} noValidate aria-labelledby="first-run-invite-heading">
    <h4 id="first-run-invite-heading">Invite teammates</h4>
    <p>Clerk emails them an invitation to this workspace. Once they join, you can pick them as Reviewers.</p>
    <Input label="Email address" type="email" name="email" autoComplete="off" spellCheck={false} value={email} onChange={event => setEmail(event.target.value)} disabled={busy} />
    {roles.length > 1
      ? <RadioGroup label="Invite as" name="first-run-invite-role" value={role} onValueChange={value => setRole(value as FirstRunInviteRole)}
          options={roles.map(option => ({ value: option, label: ROLE_LABELS[option], description: ROLE_NOTES[option] }))} />
      : <p><strong>{ROLE_LABELS.member}</strong>: {ROLE_NOTES.member}</p>}
    {result?.error && <Alert role="alert" tone="danger" title={result.error} />}
    <p role="status" className={styles.status}>{result?.status ?? ""}</p>
    <Button type="submit" variant="secondary" loading={busy} data-seat-return="first-run-invite">Send invitation</Button>
    {seat && <PaidSeatDialog change={seat.change} open={seatOpen} onOpenChange={setSeatOpen} returnTo="first-run-invite"
      onConfirm={() => { setSeatOpen(false); seat.send(); }} />}
  </form>;
}
