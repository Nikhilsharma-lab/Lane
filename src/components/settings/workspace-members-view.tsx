"use client";

import { useRef, useState, type FormEvent, type ReactNode, type Ref } from "react";
import { couldNotOpen, popupCode, usePopupCode } from "@/components/popup/lazy-popup";
import { Dialog, DialogClose, DialogContent } from "@/components/popup/adaptive-dialog";
import { Alert } from "@/components/arc/alert/alert";
import { Avatar } from "@/components/arc/avatar/avatar";
import { Badge } from "@/components/arc/badge/badge";
import { Button } from "@/components/arc/button/button";
import { Input } from "@/components/arc/input/input";
import { RadioGroup } from "@/components/arc/radio-group/radio-group";
import { SearchField } from "@/components/arc/search-field/search-field";
import { Select } from "@/components/arc/select/select";
import { callAction } from "@/lib/action-call";
import { emailAddressProblem } from "@/lib/email-address-rules";
import { thrownMessage, TRY_AGAIN } from "@/lib/failure-messages";
import type { WorkspacePermission } from "@/lib/auth-guard";
import {
  addsPaidSeat, inviteSeatNote, ROLE_DESCRIPTIONS, unavailableRolesNote,
  type PaidSeatChange, type PendingInvitation, type WorkspaceMember,
} from "@/lib/member-role-rules";
import { isWorkspacePermission, ROLE_NAMES } from "@/lib/role-rules";
import { RoleGuide } from "./role-guide";
import { SettingsBlock, SettingsGroup, SettingsRow, SettingsRowFailure, SettingsRowList } from "./settings-group";
import styles from "./settings.module.css";
import members from "./members.module.css";
import { Placeholder } from "@/components/loading/placeholder";

/** #215: loaded the first time a paid seat is confirmed, so the confirmation adds nothing to any first load. */
// If it can't load, Lane says so and nobody is added.
const seatDialogCode = popupCode(() => import("./paid-seat-dialog"));

/** `field: "email"`: the refusal is about the invite's address, so it belongs on the field. */
type Answer = { success?: true; error?: string; field?: "email" };

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
  /** An Admin's way to remove people, which stays in Clerk; shown under the lists, above the role guide. */
  manage?: ReactNode;
  onInvite: (email: string, role: WorkspacePermission, confirmedPaidSeat?: boolean) => Promise<Answer>;
  onChangeRole: (userId: string, role: WorkspacePermission, confirmedPaidSeat?: boolean) => Promise<Answer>;
  onRevoke: (invitationId: string) => Promise<Answer>;
  onRetry: () => void;
};

const FAILED = "Couldn’t reach Lane. Try again.";
const roleName = (role: WorkspacePermission | null) => role ? ROLE_NAMES[role] : "Another role";
/** The roles an Admin can give, as the role picker and the invite's Role choice list them. */
const roleOptions = (roles: WorkspacePermission[]) => roles.map(role => ({ value: role, label: ROLE_NAMES[role], description: ROLE_DESCRIPTIONS[role] }));
const withArticle = (role: WorkspacePermission) => `${role === "admin" ? "an" : "a"} ${ROLE_NAMES[role]}`;
/** The accepted prototype's matching (#325): a person's shown name or address contains what was typed. */
const matches = (person: WorkspaceMember, needle: string) => !needle || `${person.name} ${person.email}`.toLowerCase().includes(needle);

/** Runs one change through the session-renewing call, so every answer is `{ success }` or `{ error }`. */
async function attempt(run: () => Promise<Answer>): Promise<Answer> {
  try {
    const answer = await callAction(run);
    return answer.success ? answer : { error: answer.error || FAILED, field: answer.field };
  } catch (thrown) {
    return { error: thrownMessage(thrown, FAILED) };
  }
}

/**
 * #210 Settings → Members, for Admins and Members (Viewers and Guests don't get this section). Everyone here sees
 * and searches the people and their roles. An Admin also invites one person at a time from Invite people, changes
 * anyone else's role and revokes pending invitations. Clerk holds every membership and invitation.
 *
 * #288 (#325, accepted design A, stacked groups): search over People, Pending invitations below, the Clerk removal
 * row, then "What each role can do" folded at the bottom. A failed role change or revoke says so on its row with Try
 * again, and the row keeps its role or invitation. The invite form's address and role stay while Settings switches
 * sections in place, and after a failed send; a sent invitation closes the form and appears under Pending invitations.
 *
 * #215: while billing is enforced (`confirmPaidSeats`), inviting a Member or Admin, or making a Guest or Viewer one,
 * first asks the Admin to confirm "This adds a paid seat". Cancelling changes nothing; focus goes back to the
 * control that asked.
 */
export function WorkspaceMembersView({ people, invitations, selfId, canManage, roles, state, confirmPaidSeats = false, manage, onInvite, onChangeRole, onRevoke, onRetry }: WorkspaceMembersViewProps) {
  const [query, setQuery] = useState("");
  const [inviteOpen, setInviteOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<WorkspacePermission>("member");
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const [rowError, setRowError] = useState<{ id: string; message: string; retry: () => void } | null>(null);
  const [seat, setSeat] = useState<{ change: PaidSeatChange; add: () => void; returnTo: string } | null>(null);
  const [seatOpen, setSeatOpen] = useState(false);
  const seatDialog = usePopupCode(seatDialogCode, seatOpen, () => couldNotOpen("paid-seat", setSeatOpen));
  const searchRef = useRef<HTMLInputElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);

  /** Runs `add` now, or once the Admin confirms the paid seat it adds. `returnTo` is the control focus goes back to. */
  function withSeat(from: WorkspacePermission | null, change: PaidSeatChange, returnTo: string, add: (confirmed: boolean) => void) {
    if (!confirmPaidSeats || !addsPaidSeat(from, change.role)) { add(false); return; }
    setSeat({ change, add: () => add(true), returnTo });
    setSeatOpen(true);
  }

  /** One change on a row: its failure stays on that row with Try again, which sends the same change once more. */
  async function runOnRow(key: string, change: () => Promise<Answer>, success: string) {
    setBusy(key);
    setRowError(null);
    setStatus("");
    const answer = await attempt(change);
    setBusy(null);
    if (answer.error) setRowError({ id: key, message: answer.error, retry: () => { void runOnRow(key, change, success); } });
    else setStatus(success);
  }

  async function send(address: string, role: WorkspacePermission, confirmed: boolean) {
    setBusy("invite");
    setStatus("");
    const answer = await attempt(() => onInvite(address, role, confirmed || undefined));
    setBusy(null);
    if (!answer.error) {
      setEmail("");
      setInviteOpen(false);
      setStatus(`Invitation sent to ${address} as ${withArticle(role)}.`);
      return;
    }
    // The address's own problems (its format, or a duplicate) belong on the field; anything else is about the sending.
    if (answer.field === "email") {
      setFieldError(answer.error);
      emailRef.current?.focus();
    } else setInviteError(answer.error);
  }

  function invite(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setInviteError(null);
    const problem = emailAddressProblem(email);
    if (problem) { setFieldError(problem); emailRef.current?.focus(); return; }
    const address = email.trim().toLowerCase();
    const role = inviteRole;
    withSeat(null, { kind: "invite", email: address, role }, "invite", confirmed => { void send(address, role, confirmed); });
  }

  function changeRole(person: WorkspaceMember, next: WorkspacePermission) {
    withSeat(person.role, { kind: "role", name: person.name, role: next }, person.userId, confirmed => {
      void runOnRow(person.userId, () => onChangeRole(person.userId, next, confirmed || undefined), `${person.name} is now ${withArticle(next)}.`);
    });
  }

  const failure = (id: string) => rowError?.id === id && <SettingsRowFailure title={rowError.message} onRetry={rowError.retry} />;
  const offered = roleOptions(roles);
  const needle = query.trim().toLowerCase();
  const shown = people.filter(person => matches(person, needle));
  // The count sits beside the group's name, outside what names the group.
  const count = (n: number) => <>{" "}<span className={members.groupCount} aria-hidden="true">{n}</span></>;

  return <>
    <div className={members.membersBar}>
      <SearchField ref={searchRef} label="Search people" hideLabel placeholder="Search name or email" value={query} onValueChange={setQuery} autoComplete="off" spellCheck={false} />
      {canManage && <Button type="button" disabled={state !== "ready"} onClick={() => { setInviteError(null); setInviteOpen(true); }}>Invite people</Button>}
    </div>

    <SettingsGroup label={<><span id="people-heading">People</span>{state === "ready" && count(shown.length)}</>} aria-labelledby="people-heading"
      description={canManage ? "Everyone in this workspace. Change someone’s role to change what they can do." : "Everyone in this workspace and their role. Only Admins invite people or change roles."}>
      {state === "loading" && <SettingsBlock><Placeholder label="Loading people…" lines={3} avatar /></SettingsBlock>}
      {state === "error" && <SettingsBlock><Alert role="alert" tone="danger" title="People couldn’t be loaded" /><Button variant="secondary" size="sm" onClick={onRetry}>{TRY_AGAIN}</Button></SettingsBlock>}
      {state === "ready" && (shown.length ? <SettingsRowList label="People in this workspace">
        {shown.map(person => {
          const self = person.userId === selfId;
          const label = `Role for ${person.name}`;
          // A role that can't be given right now (a Guest while the switch is off) still shows as the current value.
          const options = [...offered, ...(person.role && !roles.includes(person.role) ? [{ value: person.role, label: ROLE_NAMES[person.role], disabled: true }] : [])];
          return <SettingsRow as="li" key={person.userId} leading={<Avatar name={person.name} src={person.imageUrl} size="sm" unoptimized />}
            label={<>{person.name}{self && <span className={members.you}> (you)</span>}</>} hint={person.email}
            control={canManage && !self && person.role
              ? <Select label={label} value={person.role} options={options} disabled={busy === person.userId} onContentKeyDown={event => event.stopPropagation()}
                  onValueChange={next => { if (next !== person.role && isWorkspacePermission(next)) changeRole(person, next); }}
                  trigger={<Button type="button" variant="secondary" size="sm" loading={busy === person.userId} aria-label={`${label}: ${roleName(person.role)}`} data-seat-return={person.userId}>{roleName(person.role)}</Button>} />
              : <Badge>{roleName(person.role)}</Badge>}>
            {failure(person.userId)}
          </SettingsRow>;
        })}
      </SettingsRowList> : <SettingsBlock>
        <p>{needle ? `No one matches “${query.trim()}”.` : "No one is in this workspace yet."}</p>
        {needle && <Button variant="secondary" size="sm" onClick={() => { setQuery(""); searchRef.current?.focus(); }}>Show everyone</Button>}
      </SettingsBlock>)}
    </SettingsGroup>

    {/* While the lists can't be loaded, People says so and offers Try again; there are no invitations to show. */}
    {canManage && state !== "error" && <SettingsGroup label={<><span id="invitations-heading">Pending invitations</span>{state === "ready" && count(invitations.length)}</>} aria-labelledby="invitations-heading">
      {state === "ready" && (invitations.length
        ? <SettingsRowList label="Pending invitations">
            {invitations.map(invitation => <SettingsRow as="li" key={invitation.id} leading={<Avatar name={invitation.email} size="sm" />} label={invitation.email}
              hint={`Invited as ${invitation.role ? withArticle(invitation.role) : "another role"}`}
              control={<Button variant="ghost" size="sm" loading={busy === invitation.id} disabled={!!busy && busy !== invitation.id} aria-label={`Revoke the invitation for ${invitation.email}`}
                onClick={() => { void runOnRow(invitation.id, () => onRevoke(invitation.id), `The invitation for ${invitation.email} was revoked.`); }}>Revoke</Button>}>
              {failure(invitation.id)}
            </SettingsRow>)}
          </SettingsRowList>
        : <SettingsBlock><p>No invitations are waiting.</p></SettingsBlock>)}
      {state === "loading" && <SettingsBlock><Placeholder label="Loading invitations…" lines={1} /></SettingsBlock>}
    </SettingsGroup>}

    <p role="status" className={members.membersStatus}>{status}</p>
    {manage}
    {canManage && <p className={styles.note}>Your own role can’t be changed here. Ask another Admin to change it.</p>}
    <RoleGuide offered={roles} />

    {canManage && <Dialog open={inviteOpen} dismissible={busy !== "invite"} onOpenChange={setInviteOpen}>
      <DialogContent className={members.inviteDialog} title="Invite people" description="Clerk emails them an invitation to this workspace.">
        <InvitePeopleForm email={email} role={inviteRole} roles={roles} confirmPaidSeats={confirmPaidSeats} busy={busy === "invite"} fieldError={fieldError} error={inviteError} emailRef={emailRef}
          onEmail={value => { setEmail(value); setFieldError(null); }} onRole={setInviteRole} onSubmit={invite} />
      </DialogContent>
    </Dialog>}

    {seat && seatDialog && <seatDialog.PaidSeatDialog change={seat.change} open={seatOpen} onOpenChange={setSeatOpen} returnTo={seat.returnTo}
      onConfirm={() => { setSeatOpen(false); seat.add(); }} />}
  </>;
}

/**
 * #288 (D26, D27, D28): the one-person invite inside Invite people. The address takes the full width and shows its
 * problem on the field; the seat note names the free roles only while they can be given.
 */
export function InvitePeopleForm({ email, role, roles, confirmPaidSeats, busy, fieldError, error, emailRef, onEmail, onRole, onSubmit }: {
  email: string; role: WorkspacePermission; roles: WorkspacePermission[]; confirmPaidSeats: boolean; busy: boolean;
  fieldError: string | null; error: string | null; emailRef?: Ref<HTMLInputElement>;
  onEmail: (value: string) => void; onRole: (role: WorkspacePermission) => void; onSubmit: (event: FormEvent) => void;
}) {
  const unavailable = unavailableRolesNote(roles);
  return <form className={members.inviteForm} onSubmit={onSubmit} noValidate aria-label="Invite people" aria-busy={busy || undefined}>
    <Input ref={emailRef} label="Email address" type="email" name="email" autoComplete="off" spellCheck={false} value={email} readOnly={busy} error={fieldError ?? undefined}
      onChange={event => onEmail(event.target.value)} />
    <RadioGroup label="Role" name="invite-role" value={role} onValueChange={value => { if (isWorkspacePermission(value)) onRole(value); }}
      options={roleOptions(roles)} />
    <div className={members.inviteNotes}>
      <p>{inviteSeatNote(roles)}{confirmPaidSeats ? " You’ll confirm each paid seat before it’s added." : ""}</p>
      {unavailable && <p>{unavailable}</p>}
      <p>PM, Designer and Developer are profile labels. They don’t change what anyone can do.</p>
    </div>
    {error && <Alert role="alert" tone="danger" title={error} />}
    <div className={members.inviteActions}>
      <DialogClose asChild><Button type="button" variant="secondary" disabled={busy}>Cancel</Button></DialogClose>
      <Button type="submit" loading={busy} data-seat-return="invite">Send invitation</Button>
    </div>
  </form>;
}
