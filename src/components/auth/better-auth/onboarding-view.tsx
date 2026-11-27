"use client"

import { useState, useSyncExternalStore, type ReactNode } from "react"

import { Alert } from "@/components/arc/alert/alert"
import { Button } from "@/components/arc/button/button"
import type { AuthAnswer } from "@/lib/auth-answer"
import { AuthAction } from "../auth-action"
import { AuthInputField } from "../auth-field"
import { AuthFormCard } from "../auth-form-card"
import { OnboardingChrome } from "../onboarding-chrome"
import { OrDivider } from "./google-mark"
import { withArticle } from "./invitation-copy"
import { createOnboardingFlow, type OnboardingFlow, type OnboardingState, type PendingWorkspaceInvitation } from "./onboarding-flow"
import styles from "./better-auth.module.css"
import invitationStyles from "./invitations.module.css"

export type OnboardingWorkspaceStepProps = {
  /** The signed-in person's email, which an Admin invites. */
  email: string
  /** Invitations waiting for that email, which come first (#333 Q12). */
  invitations: PendingWorkspaceInvitation[]
  /** The workspace they were removed from or left, when that left them with none. */
  removedFrom?: string
  /** The header's Sign out: Onboarding passes `BetterAuthSignOut`, so this view never imports the browser client. */
  signOut: ReactNode
  /** Joins with the invitation and goes there; answers success or an error code. */
  onJoin: (invitationId: string) => Promise<AuthAnswer>
  /** Creates a workspace with the trimmed name and goes there; answers success or an error code. */
  onCreate: (name: string) => Promise<AuthAnswer>
}

const NAME_ID = "onboarding-workspace-name"
const ALERT_IDS = { join: "onboarding-join-alert", create: "onboarding-create-alert" } as const

/** #376 story 94: after a refused submit, focus goes to the name field or to the box with the line. */
function focusRefusal({ nameError, alert }: OnboardingState) {
  const target = nameError ? NAME_ID : alert ? ALERT_IDS[alert.at] : null
  if (target) document.getElementById(target)?.focus()
}

/**
 * #379 (#376 "The onboarding workspace step", #346): between signing in and having a workspace. Pending invitations
 * first, each with Join, then "Or start a workspace of your own"; with none, Create your workspace. Onboarding's
 * `WorkspaceStep` (#391) mounts it with its calls.
 */
export function OnboardingWorkspaceStep({ email, invitations, removedFrom, signOut, onJoin, onCreate }: OnboardingWorkspaceStepProps) {
  const [flow] = useState<OnboardingFlow>(() => createOnboardingFlow({ invitations, onJoin, onCreate }))
  const state = useSyncExternalStore(flow.subscribe, flow.snapshot, flow.snapshot)
  const [name, setName] = useState("")
  const { nameError, alert, pending } = state
  const invited = invitations.length > 0

  async function act(action: () => Promise<void>) {
    await action()
    focusRefusal(flow.snapshot())
  }

  const box = (at: "join" | "create") => alert?.at === at && <Alert tone="danger" title={alert.title} id={ALERT_IDS[at]} tabIndex={-1}>{alert.detail}</Alert>

  const create = <form className={styles.stack} noValidate onSubmit={(event) => {
    event.preventDefault()
    void act(() => flow.create(name))
  }}>
    <AuthInputField id={NAME_ID} label="Workspace name" name="workspace" autoComplete="organization" placeholder="Your team or company" required
      value={name} error={nameError ?? undefined} disabled={pending === "create"}
      onChange={(event) => { setName(event.target.value); flow.editName() }} />
    {box("create")}
    <AuthAction type="submit" kind={invited ? "secondary" : "primary"} loading={pending === "create"}>Create workspace</AuthAction>
  </form>

  return <OnboardingChrome headerAction={signOut}>
    <AuthFormCard
      title={invited ? "Join your team" : "Create your workspace"}
      description={invited ? `You’ve been invited to these workspaces as ${email}.` : "A workspace is where your team’s Requests live. You can invite people next."}>
      <div className={styles.stack}>
        {removedFrom && <Alert tone="info" title={`You’re no longer in ${removedFrom}`}>Your Requests and comments stay in that workspace.</Alert>}
        {invited && <>
          <ul className={invitationStyles.list} aria-label="Invitations">
            {invitations.map((invitation) => {
              const joining = typeof pending === "object" && pending?.join === invitation.id
              return <li key={invitation.id} className={invitationStyles.row}>
                <div className={invitationStyles.rowText}>
                  <strong>{invitation.workspace}</strong>
                  <span className={styles.small}>{invitation.inviter} invited you as {withArticle(invitation.role)}</span>
                </div>
                <Button type="button" size="sm" loading={joining} aria-label={`Join ${invitation.workspace}`} onClick={() => void act(() => flow.join(invitation.id))}>Join</Button>
              </li>
            })}
          </ul>
          {box("join")}
          <OrDivider />
          <p className={invitationStyles.muted}>Or start a workspace of your own.</p>
        </>}
        {create}
        {!invited && <p className={styles.small}>Expecting an invitation? Ask an Admin to invite {email}. It shows up here.</p>}
      </div>
    </AuthFormCard>
  </OnboardingChrome>
}
