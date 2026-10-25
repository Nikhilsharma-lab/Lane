"use client";

import { useState, type FormEvent } from "react";
import { Alert } from "@/components/arc/alert/alert";
import { Badge } from "@/components/arc/badge/badge";
import { Button } from "@/components/arc/button/button";
import { Input } from "@/components/arc/input/input";
import { RadioGroup } from "@/components/arc/radio-group/radio-group";
import { Select } from "@/components/arc/select/select";
import { Skeleton } from "@/components/arc/skeleton/skeleton";
import { callAction } from "@/lib/action-call";
import type { WorkspacePermission } from "@/lib/auth-guard";
import { ROLE_DESCRIPTIONS, type PendingInvitation, type WorkspaceMember } from "@/lib/member-role-rules";
import { ROLE_NAMES } from "@/lib/role-rules";
import styles from "./settings.module.css";

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
  onInvite: (email: string, role: WorkspacePermission) => Promise<Answer>;
  onChangeRole: (userId: string, role: WorkspacePermission) => Promise<Answer>;
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
  } catch {
    return { error: FAILED };
  }
}

/**
 * #210 Settings → Members, for Admins and Members (Viewers and Guests don't get this section). Everyone here sees
 * the people and their roles. An Admin also invites people as a role, changes anyone else's role and revokes
 * pending invitations. Clerk holds every membership and invitation. Each change is confirmed in its own card, in a
 * polite status line, or an alert when it fails.
 */
export function WorkspaceMembersView({ people, invitations, selfId, canManage, roles, state, onInvite, onChangeRole, onRevoke, onRetry }: WorkspaceMembersViewProps) {
  const [email, setEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<WorkspacePermission>("member");
  const [busy, setBusy] = useState<string | null>(null);
  const [result, setResult] = useState<{ card: Card; status: string; error: string | null } | null>(null);

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
    if (await run("invite", "invite", () => onInvite(address, inviteRole), `Invitation sent to ${address} as ${withArticle(inviteRole)}.`)) setEmail("");
  }

  const feedback = (card: Card) => <>
    {result?.card === card && result.error && <Alert role="alert" tone="danger" title={result.error} />}
    <p role="status" className={styles.feedback}>{result?.card === card ? result.status : ""}</p>
  </>;
  const roleOptions = roles.map(role => ({ value: role, label: ROLE_NAMES[role], description: ROLE_DESCRIPTIONS[role] }));

  return <>
    {canManage && <form className={styles.card} onSubmit={event => { void invite(event); }} noValidate aria-labelledby="invite-heading">
      <div className={styles.cardBody}>
        <h3 id="invite-heading">Invite someone</h3>
        <p>Clerk emails them an invitation to this workspace. Admins and Members are paid seats. Guests and Viewers are free.</p>
        <Input label="Email address" type="email" name="email" autoComplete="off" spellCheck={false} value={email} onChange={event => setEmail(event.target.value)} disabled={busy === "invite"} />
        <RadioGroup label="Role" name="invite-role" value={inviteRole} onValueChange={value => setInviteRole(value as WorkspacePermission)} options={roleOptions} />
        {roles.length < 4 && <p className={styles.note}>Guest and Viewer aren’t available in this workspace yet.</p>}
        {feedback("invite")}
      </div>
      <div className={styles.cardFooter}>
        <span>PM, Designer and Developer are profile labels. They don’t change what anyone can do.</span>
        <Button type="submit" loading={busy === "invite"}>Send invitation</Button>
      </div>
    </form>}

    <section className={styles.card} aria-labelledby="people-heading">
      <div className={styles.cardBody}>
        <h3 id="people-heading">People</h3>
        <p>{canManage ? "Everyone in this workspace. Change someone’s role to change what they can do." : "Everyone in this workspace and their role. Only Admins invite people or change roles."}</p>
        {state === "loading" && <div className={styles.rows}><Skeleton label="Loading people…" lines={3} /></div>}
        {state === "error" && <div className={styles.rows}><Alert role="alert" tone="danger" title="People couldn’t be loaded." /><Button variant="secondary" size="sm" onClick={onRetry}>Try again</Button></div>}
        {state === "ready" && <ul className={styles.rows} aria-label="People in this workspace">
          {people.map(person => {
            const self = person.userId === selfId;
            const label = `Role for ${person.name}`;
            // A role that can't be given right now (a Guest while the switch is off) still shows as the current value.
            const options = [...roleOptions, ...(person.role && !roles.includes(person.role) ? [{ value: person.role, label: ROLE_NAMES[person.role], disabled: true }] : [])];
            return <li key={person.userId} className={`${styles.row} ${styles.person}`}>
              <div><strong>{person.name}{self && " (you)"}</strong><p>{person.email}</p></div>
              {canManage && !self && person.role
                ? <Select label={label} value={person.role} options={options} disabled={busy === person.userId} onContentKeyDown={event => event.stopPropagation()}
                    onValueChange={next => { if (next !== person.role) void run("people", person.userId, () => onChangeRole(person.userId, next as WorkspacePermission), `${person.name} is now ${withArticle(next as WorkspacePermission)}.`); }}
                    trigger={<Button type="button" variant="secondary" size="sm" loading={busy === person.userId} aria-label={`${label}: ${roleName(person.role)}`}>{roleName(person.role)}</Button>} />
                : <Badge>{roleName(person.role)}</Badge>}
            </li>;
          })}
        </ul>}
        {canManage && feedback("people")}
      </div>
    </section>

    {canManage && <section className={styles.card} aria-labelledby="invitations-heading">
      <div className={styles.cardBody}>
        <h3 id="invitations-heading">Pending invitations</h3>
        {state === "ready" && (invitations.length
          ? <ul className={styles.rows} aria-label="Pending invitations">
              {invitations.map(invitation => <li key={invitation.id} className={`${styles.row} ${styles.person}`}>
                <div><strong>{invitation.email}</strong><p>Invited as {invitation.role ? withArticle(invitation.role) : "another role"}</p></div>
                <Button variant="ghost" size="sm" loading={busy === invitation.id} aria-label={`Revoke the invitation for ${invitation.email}`}
                  onClick={() => { void run("invitations", invitation.id, () => onRevoke(invitation.id), `The invitation for ${invitation.email} was revoked.`); }}>Revoke</Button>
              </li>)}
            </ul>
          : <p className={styles.note}>No invitations are waiting.</p>)}
        {state === "loading" && <Skeleton label="Loading invitations…" lines={1} />}
        {feedback("invitations")}
      </div>
    </section>}
  </>;
}
