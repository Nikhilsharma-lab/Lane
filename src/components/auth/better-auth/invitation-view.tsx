"use client"

import { useState, useSyncExternalStore, type ReactNode } from "react"

import { Alert } from "@/components/arc/alert/alert"
import { LocalTime } from "@/components/requests/local-time"
import { AuthAction } from "../auth-action"
import { AuthFormCard } from "../auth-form-card"
import { AuthShell } from "../auth-shell"
import { invitationRefusal, withArticle } from "./invitation-copy"
import { createInvitationFlow, type Invitation, type InvitationFlow, type InvitationState, type InvitationViewer } from "./invitation-flow"
import styles from "./better-auth.module.css"
import invitations from "./invitations.module.css"

export type InvitationViewProps = {
  /** What increment 5's `/invite/[id]` reads on the server. */
  invitation: Invitation
  viewer: InvitationViewer
  /** Where Open <workspace> goes: an address that opens the invitation's workspace, read with the invitation. */
  workspaceAddress: string
  /** Called once the person has joined; increment 5 sends them to the role step. */
  onJoined: () => void
}

const ALERT_ID = "invitation-alert"
const SCREEN_ID = "invitation-screen"

/** #376 story 94: after a refused press, focus goes to the box, or to the new screen a refusal moved to. */
function focusRefusal(before: InvitationState, after: InvitationState) {
  const target = after.alert ? ALERT_ID : after.screen !== before.screen && after.screen !== "joined" ? SCREEN_ID : null
  if (target) document.getElementById(target)?.focus()
}

/**
 * #379 (#376 "The invitation page view", #346's state list): what a person meets on an invitation link, picked from
 * the invitation and who is looking. Accept, Decline and the switch to the invited email go through Lane's browser
 * auth client. Dormant: no route mounts it until increment 5.
 */
export function InvitationView({ invitation, viewer, workspaceAddress, onJoined }: InvitationViewProps) {
  // A full page load after signing out or in, so every server read sees the new session.
  const [flow] = useState<InvitationFlow>(() => createInvitationFlow({ invitation, viewer, workspaceAddress, onJoined, navigate: (path) => window.location.assign(path) }))
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
        <AuthAction type="button" loading={pending === "sign-out"} onClick={() => void act(flow.signInAsInvited)}>Sign out and sign in as {email}</AuthAction>
        <AuthAction type="button" kind="tertiary" onClick={flow.goToLane}>Stay signed in as {current}</AuthAction>
      </>)
    }
    case "expired": return shell("This invitation has expired", `Invitations last 7 days. Ask an Admin of ${workspace} to send it again.`, goToLane)
    case "already-accepted": return shell(`You’re already in ${workspace}`, "This invitation has been accepted.",
      <AuthAction type="button" onClick={flow.openWorkspace}>Open {workspace}</AuthAction>)
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
    // Proposed for Nikhil: what shows while increment 5 moves on to the role step.
    case "joined": return shell(`You’re in ${workspace}`, "Next, choose your role.", null)
  }
}
