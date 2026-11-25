"use client"

import { useState, useSyncExternalStore, type ReactNode } from "react"

import { Alert } from "@/components/arc/alert/alert"
import { LocalTime } from "@/components/requests/local-time"
import type { AuthAnswer } from "@/lib/auth-answer"
import { AuthAction } from "../auth-action"
import { AuthFormCard } from "../auth-form-card"
import { AuthShell } from "../auth-shell"
import { invitationRefusal, withArticle } from "./invitation-copy"
import { createInvitationFlow, type Invitation, type InvitationFlow, type InvitationState, type InvitationViewer } from "./invitation-flow"
import styles from "./better-auth.module.css"
import invitations from "./invitations.module.css"

export type InvitationViewProps = {
  /** What `/invite/[id]` reads on the server. */
  invitation: Invitation
  viewer: InvitationViewer
  /** Switches to the invitation's workspace, for Open <workspace>. */
  openWorkspace: () => Promise<AuthAnswer>
  /** Called once the person has joined; it sends them to the role step or home. */
  onJoined: () => void
}

const ALERT_ID = "invitation-alert"
const SCREEN_ID = "invitation-screen"

/** A button's words when they name an email or a workspace, which may be long. */
const LongLabel = ({ children }: { children: ReactNode }) => <span className={invitations.longLabel}>{children}</span>

/** #376 story 94: after a refused press, focus goes to the box, or to the new screen a refusal moved to. */
function focusRefusal(before: InvitationState, after: InvitationState) {
  const target = after.alert ? ALERT_ID : after.screen !== before.screen && after.screen !== "joined" ? SCREEN_ID : null
  if (target) document.getElementById(target)?.focus()
}

/**
 * #379 (#376 "The invitation page view", #346's state list): what a person meets on an invitation link, picked from
 * the invitation and who is looking. Accept, Decline and the switch to the invited email go through Lane's browser
 * auth client. `/invite/[id]` mounts it (#392).
 */
export function InvitationView({ invitation, viewer, openWorkspace, onJoined }: InvitationViewProps) {
  // A full page load after signing out or in, so every server read sees the new session.
  const [flow] = useState<InvitationFlow>(() => createInvitationFlow({ invitation, viewer, openWorkspace, onJoined, navigate: (path) => window.location.assign(path) }))
  const state = useSyncExternalStore(flow.subscribe, flow.snapshot, flow.snapshot)
  const { screen, alert, pending } = state
  const { workspace, inviter, email } = invitation

  async function act(action: () => Promise<void>) {
    const before = flow.snapshot()
    await action()
    focusRefusal(before, flow.snapshot())
  }

  const card = <div className={invitations.card}>
    <strong>{workspace}</strong>
    <p className={invitations.muted}>{inviter} invited {email} to join as {withArticle(invitation.role)}.</p>
    {/* Proposed for Nikhil: the expiry, shown and never used to decide (#376 Q3). */}
    <p className={styles.small}>Open until <LocalTime iso={invitation.expiresAt} day />.</p>
  </div>

  const box = alert && <Alert tone="danger" title={alert.message} id={ALERT_ID} tabIndex={-1}>
    {alert.offer === "code" && <button type="button" className={styles.textLink} onClick={() => void act(flow.confirmWithCode)}>Email me a sign-in code</button>}
  </Alert>

  const shell = (title: string, description: ReactNode, body: ReactNode) => <AuthShell>
    <div id={SCREEN_ID} tabIndex={-1} className={invitations.screen}>
      <AuthFormCard title={title} description={description}><div className={styles.stack}>{body}</div></AuthFormCard>
    </div>
  </AuthShell>

  const goToLane = <AuthAction type="button" kind="secondary" onClick={flow.goToLane}>Go to Lane</AuthAction>

  switch (screen) {
    case "sign-in": return shell(`Join ${workspace}`, `Sign in as ${email} to accept.`, <>
      {card}
      <AuthAction type="button" onClick={flow.signIn}>Sign in to accept</AuthAction>
      <p className={styles.small}>After you sign in, you come back here to accept.</p>
    </>)
    case "create-account": return shell(`Join ${workspace}`, `Create a Lane account with ${email} to accept.`, <>
      {card}
      <AuthAction type="button" onClick={flow.createAccount}>Create an account</AuthAction>
      <AuthAction type="button" kind="tertiary" onClick={flow.signIn}>I already have an account</AuthAction>
    </>)
    case "accept": return shell(`Join ${workspace}`, `You’re signed in as ${email}.`, <>
      {card}
      {box}
      <AuthAction type="button" loading={pending === "accept"} onClick={() => void act(flow.accept)}>Accept and join</AuthAction>
      <AuthAction type="button" kind="tertiary" loading={pending === "decline"} onClick={() => void act(flow.decline)}>Decline</AuthAction>
    </>)
    case "someone-else": {
      const current = viewer.signedIn ? viewer.email : ""
      return shell("This invitation is for someone else", <>It was sent to <strong>{email}</strong>, and you’re signed in as <strong>{current}</strong>.</>, <>
        {card}
        {box}
        <AuthAction type="button" loading={pending === "sign-out"} onClick={() => void act(flow.signInAsInvited)}><LongLabel>Sign out and sign in as {email}</LongLabel></AuthAction>
        <AuthAction type="button" kind="tertiary" onClick={flow.goToLane}><LongLabel>Stay signed in as {current}</LongLabel></AuthAction>
      </>)
    }
    case "expired": return shell("This invitation has expired", `Invitations last 7 days. Ask an Admin of ${workspace} to send it again.`, goToLane)
    case "already-accepted": return shell(`You’re already in ${workspace}`, "This invitation has been accepted.", <>
      {box}
      <AuthAction type="button" loading={pending === "open"} onClick={() => void act(flow.openWorkspace)}><LongLabel>Open {workspace}</LongLabel></AuthAction>
    </>)
    // Proposed for Nikhil: someone who was never in the workspace, or isn't any more, can hold the link.
    case "accepted": return viewer.signedIn
      ? shell("This invitation has been accepted", `You’re not in ${workspace}. Ask one of its Admins to invite you.`, goToLane)
      : shell("This invitation has been accepted", `Sign in as ${email} to open ${workspace}.`,
        <AuthAction type="button" onClick={() => void flow.openWorkspace()}>Open {workspace}</AuthAction>)
    case "cancelled": return shell("This invitation can’t be used", `It was cancelled or declined. Ask an Admin of ${workspace} for a new one.`, goToLane)
    case "closed": {
      const { title, detail } = invitationRefusal("INVITATION_NOT_FOUND", workspace)!
      return shell(title, detail, goToLane)
    }
    case "full": {
      const { title, detail } = invitationRefusal("ORGANIZATION_MEMBERSHIP_LIMIT_REACHED", workspace)!
      return shell(title, detail, <>
        {card}
        {box}
        <AuthAction type="button" kind="secondary" loading={pending === "accept"} onClick={() => void act(flow.accept)}>Try again</AuthAction>
      </>)
    }
    // Proposed for Nikhil: what shows while the page moves on, to the role step after a first workspace, else to it.
    case "joined": return shell(`You’re in ${workspace}`, "Opening Lane…", null)
  }
}
