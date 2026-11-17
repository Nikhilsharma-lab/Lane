"use client";

import { useState, type FormEvent } from "react";
import { couldNotOpen, popupCode, usePopupCode } from "@/components/popup/lazy-popup";
import { Alert } from "@/components/arc/alert/alert";
import { Badge } from "@/components/arc/badge/badge";
import { Button } from "@/components/arc/button/button";
import { Input } from "@/components/arc/input/input";
import { RadioGroup } from "@/components/arc/radio-group/radio-group";
import { Select } from "@/components/arc/select/select";
import { callAction } from "@/lib/action-call";
import { thrownMessage } from "@/lib/failure-messages";
import type { WorkspacePermission } from "@/lib/auth-guard";
import {
  addsPaidSeat, ROLE_DESCRIPTIONS, type PaidSeatChange, type PendingInvitation, type WorkspaceMember,
} from "@/lib/member-role-rules";
import { ROLE_NAMES } from "@/lib/role-rules";
import { SettingsBlock, SettingsGroup, SettingsRow, SettingsRowList } from "./settings-group";
import styles from "./settings.module.css";
import { Placeholder } from "@/components/loading/placeholder";

/** #215: loaded the first time a paid seat is confirmed, so the confirmation adds nothing to any first load. */
// If it can't load, Lane says so and nobody is added.
const seatDialogCode = popupCode(() => import("./paid-seat-dialog"));

type Answer = { success?: true; error?: string };
type Card = "invite" | "people" | "invitations";

export type WorkspaceMembersViewProps = {
  people: WorkspaceMember[];
  /** Pending invitations; only an Admin is shown them. */
  invitations: PendingInvitation[];
  selfId: string;
  /** An Admin: invites, changes roles and revokes invitations. */
  canManage: boolean;
  /** The roles an Admin can give now: Admin and Member, plus Guest and Viewer once Clerk Enhanced B2B is approved. */
  roles: WorkspacePermission[];
  state: "loading" | "ready" | "error";
  /** #215: while billing is enforced, adding a paid seat (Admin or Member) is confirmed first. */
  confirmPaidSeats?: boolean;
  onInvite: (email: string, role: WorkspacePermission, confirmedPaidSeat?: boolean) => Promise<Answer>;
  onChangeRole: (userId: string, role: WorkspacePermission, confirmedPaidSeat?: boolean) => Promise<Answer>;
  onRevoke: (invitationId: string) => Promise<Answer>;
  onRetry: () => void;
};

const FAILED = "Couldn’t reach Lane. Try again.";
const roleName = (role: WorkspacePermission | null) => role ? ROLE_NAMES[role] : "Another role";
const withArticle = (role: WorkspacePermission) => `${role === "admin" ? "an" : "a"} ${ROLE_NAMES[role]}`;

/** Runs one change through the session-renewing call, so every answer is `{ success }` or `{ error }`. */
async function attempt(run: () => Promise<Answer>): Promise<Answer> {
  try {
    const answer = await callAction(run);
    return answer.success ? answer : { error: answer.error || FAILED };
  } catch (thrown) {
    return { error: thrownMessage(thrown, FAILED) };
  }
}

/**
 * #210 Settings → Members, for Admins and Members (Viewers and Guests don't get this section). Everyone here sees
 * the people and their roles. An Admin also invites people as a role, changes anyone else's role and revokes
 * pending invitations. Clerk holds every membership and invitation. Each change is confirmed in its own card, in a
 * polite status line, or an alert when it fails.
 *
 * #215: while billing is enforced (`confirmPaidSeats`), inviting a Member or Admin, or making a Guest or Viewer one,
 * first asks the Admin to confirm "This adds a paid seat". Cancelling changes nothing; focus goes back to the
 * control that asked.
 */
export function WorkspaceMembersView({ people, invitations, selfId, canManage, roles, state, confirmPaidSeats = false, onInvite, onChangeRole, onRevoke, onRetry }: WorkspaceMembersViewProps) {
  const [email, setEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<WorkspacePermission>("member");
  const [busy, setBusy] = useState<string | null>(null);
  const [result, setResult] = useState<{ card: Card; status: string; error: string | null } | null>(null);
  const [seat, setSeat] = useState<{ change: PaidSeatChange; add: () => void; returnTo: string } | null>(null);
  const [seatOpen, setSeatOpen] = useState(false);
  const seatDialog = usePopupCode(seatDialogCode, seatOpen, () => couldNotOpen("paid-seat", setSeatOpen));

  /** Runs `add` now, or once the Admin confirms the paid seat it adds. `returnTo` is the control focus goes back to. */
  function withSeat(from: WorkspacePermission | null, change: PaidSeatChange, returnTo: string, add: (confirmed: boolean) => void) {
    if (!confirmPaidSeats || !addsPaidSeat(from, change.role)) { add(false); return; }
    setSeat({ change, add: () => add(true), returnTo });
    setSeatOpen(true);
  }

  async function run(card: Card, key: string, change: () => Promise<Answer>, success: string) {
    setBusy(key);
    setResult(null);
    const answer = await attempt(change);
    setBusy(null);
    setResult({ card, status: answer.error ? "" : success, error: answer.error ?? null });
    return !answer.error;
  }

  async function invite(event: FormEvent) {
    event.preventDefault();
    const address = email.trim();
    if (!address) { setResult({ card: "invite", status: "", error: "Enter an email address." }); return; }
    const role = inviteRole;
    withSeat(null, { kind: "invite", email: address, role }, "invite", confirmed => {
      void run("invite", "invite", () => onInvite(address, role, confirmed || undefined), `Invitation sent to ${address} as ${withArticle(role)}.`).then(sent => { if (sent) setEmail(""); });
    });
  }

  function changeRole(person: WorkspaceMember, next: WorkspacePermission) {
    withSeat(person.role, { kind: "role", name: person.name, role: next }, person.userId, confirmed => {
      void run("people", person.userId, () => onChangeRole(person.userId, next, confirmed || undefined), `${person.name} is now ${withArticle(next)}.`);
    });
  }

  const feedback = (card: Card) => <>
    {result?.card === card && result.error && <Alert role="alert" tone="danger" title={result.error} />}
    <p role="status" className={styles.feedback}>{result?.card === card ? result.status : ""}</p>
  </>;
  const roleOptions = roles.map(role => ({ value: role, label: ROLE_NAMES[role], description: ROLE_DESCRIPTIONS[role] }));

  // #287: the same cards as row groups. The invite form's own fixes (full-width field, its messages) are #288's.
  return <>
    {canManage && <form onSubmit={event => { void invite(event); }} noValidate aria-labelledby="invite-heading">
      <SettingsGroup as="div" label="Invite someone" labelId="invite-heading"
        description={`Clerk emails them an invitation to this workspace. Admins and Members are paid seats. Guests and Viewers are free.${confirmPaidSeats ? " You’ll confirm each paid seat before it’s added." : ""}`}>
        <SettingsBlock>
          <Input label="Email address" type="email" name="email" autoComplete="off" spellCheck={false} value={email} onChange={event => setEmail(event.target.value)} disabled={busy === "invite"} />
          <RadioGroup label="Role" name="invite-role" value={inviteRole} onValueChange={value => setInviteRole(value as WorkspacePermission)} options={roleOptions} />
          {roles.length < 4 && <p className={styles.note}>Guest and Viewer aren’t available in this workspace yet.</p>}
          <p className={styles.note}>PM, Designer and Developer are profile labels. They don’t change what anyone can do.</p>
          {feedback("invite")}
          <Button type="submit" loading={busy === "invite"} data-seat-return="invite">Send invitation</Button>
        </SettingsBlock>
      </SettingsGroup>
    </form>}

    <SettingsGroup label="People" labelId="people-heading"
      description={canManage ? "Everyone in this workspace. Change someone’s role to change what they can do." : "Everyone in this workspace and their role. Only Admins invite people or change roles."}>
      {state === "loading" && <SettingsBlock><Placeholder label="Loading people…" lines={3} /></SettingsBlock>}
      {state === "error" && <SettingsBlock><Alert role="alert" tone="danger" title="People couldn’t be loaded" /><Button variant="secondary" size="sm" onClick={onRetry}>Try again</Button></SettingsBlock>}
      {state === "ready" && <SettingsRowList label="People in this workspace">
        {people.map(person => {
          const self = person.userId === selfId;
          const label = `Role for ${person.name}`;
          // A role that can't be given right now (a Guest while the switch is off) still shows as the current value.
          const options = [...roleOptions, ...(person.role && !roles.includes(person.role) ? [{ value: person.role, label: ROLE_NAMES[person.role], disabled: true }] : [])];
          return <SettingsRow as="li" key={person.userId} label={<>{person.name}{self && " (you)"}</>} hint={person.email}
            control={canManage && !self && person.role
              ? <Select label={label} value={person.role} options={options} disabled={busy === person.userId} onContentKeyDown={event => event.stopPropagation()}
                  onValueChange={next => { if (next !== person.role) changeRole(person, next as WorkspacePermission); }}
                  trigger={<Button type="button" variant="secondary" size="sm" loading={busy === person.userId} aria-label={`${label}: ${roleName(person.role)}`} data-seat-return={person.userId}>{roleName(person.role)}</Button>} />
              : <Badge>{roleName(person.role)}</Badge>} />;
        })}
      </SettingsRowList>}
      {canManage && <SettingsBlock className={styles.feedbackBlock}>{feedback("people")}</SettingsBlock>}
    </SettingsGroup>

    {/* While the lists can't be loaded, People says so and offers Try again; there are no invitations to show. */}
    {canManage && state !== "error" && <SettingsGroup label="Pending invitations" labelId="invitations-heading">
      {state === "ready" && (invitations.length
        ? <SettingsRowList label="Pending invitations">
            {invitations.map(invitation => <SettingsRow as="li" key={invitation.id} label={invitation.email} hint={`Invited as ${invitation.role ? withArticle(invitation.role) : "another role"}`}
              control={<Button variant="ghost" size="sm" loading={busy === invitation.id} aria-label={`Revoke the invitation for ${invitation.email}`}
                onClick={() => { void run("invitations", invitation.id, () => onRevoke(invitation.id), `The invitation for ${invitation.email} was revoked.`); }}>Revoke</Button>} />)}
          </SettingsRowList>
        : <SettingsBlock><p>No invitations are waiting.</p></SettingsBlock>)}
      {state === "loading" && <SettingsBlock><Placeholder label="Loading invitations…" lines={1} /></SettingsBlock>}
      <SettingsBlock className={styles.feedbackBlock}>{feedback("invitations")}</SettingsBlock>
    </SettingsGroup>}

    {seat && seatDialog && <seatDialog.PaidSeatDialog change={seat.change} open={seatOpen} onOpenChange={setSeatOpen} returnTo={seat.returnTo}
      onConfirm={() => { setSeatOpen(false); seat.add(); }} />}
  </>;
}
