"use client"

import { LockKeyholeIcon } from "lucide-react"
import { useState, type ReactNode } from "react"

import { Alert } from "@/components/arc/alert/alert"
import Link from "@/components/link"
import { AuthAction } from "../auth-action"
import { AuthInputField, AuthPasswordField } from "../auth-field"
import { AuthFormCard } from "../auth-form-card"
import { AuthShell, AuthTrust } from "../auth-shell"
import { RecoveryLoginLink } from "../recovery-login-link"
import { signUpPage } from "./auth-addresses"
import { useAuthFlow, type FocusOrder } from "./auth-flow-view"
import { CODE_INPUT, CodeStep, Countdown } from "./code-step"
import { secondsUntil } from "./code-sends"
import { createPasswordResetFlow, type PasswordResetFlow, type PasswordResetState } from "./password-reset-flow"
import { TurnstileWidget } from "./turnstile-widget"
import authStyles from "../auth.module.css"
import styles from "./better-auth.module.css"

export type PasswordResetFormProps = {
  /** An email to start with. */
  email?: string
}

const FIELD_IDS = { email: "reset-email", password: "reset-new-password" } as const
const ALERT_ID = "reset-alert"

/** #376 story 94: after a refused submit, focus goes to the first field with a problem, or to the box. */
const FOCUS_ORDER: FocusOrder<PasswordResetState> = [["email", `#${FIELD_IDS.email}`], ["code", CODE_INPUT], ["password", `#${FIELD_IDS.password}`]]

/**
 * #378 (#376 "Forgot and reset"): Lane's own forgot and reset password screen, through Lane's browser auth client. The
 * email and Send reset code, then the code, a new password and Save new password; then it signs in with the new
 * password.
 */
export function PasswordResetForm({ email }: PasswordResetFormProps) {
  // A full page load after signing in, so every server read sees the new session.
  const [flow] = useState<PasswordResetFlow>(() => createPasswordResetFlow({ email, navigate: (path) => window.location.assign(path) }))
  const [code, setCode] = useState("")
  const [password, setPassword] = useState("")
  const { state, now, act } = useAuthFlow(flow, FOCUS_ORDER, ALERT_ID)
  const { step, fieldErrors, alert, pending, nextSendAt } = state

  const box = alert && <Alert tone="danger" title={alert.message} id={ALERT_ID} tabIndex={-1}>
    {alert.offer === "sign-up" && <Link href={signUpPage(state.email)} className={authStyles.alertLink}>Sign up instead</Link>}
  </Alert>

  const shell = (title: string, description: string, body: ReactNode) => <AuthShell headerAction={<RecoveryLoginLink />}
    footer={<AuthTrust icon={LockKeyholeIcon}>Saving a new password signs you out on your other devices.</AuthTrust>}>
    <AuthFormCard title={title} description={description}>{body}</AuthFormCard>
  </AuthShell>

  // #346's "Password saved" screen. Its fallback line is the spec's (#376 story 43).
  if (step === "saved") return state.signedIn
    ? shell("Password saved", "You’re signed in here, and signed out on your other devices.",
      <AuthAction type="button" onClick={() => flow.continueToLane()}>Continue</AuthAction>)
    : shell("Password saved", "Sign in with your new password.",
      <AuthAction type="button" onClick={() => flow.goToSignIn()}>Sign in</AuthAction>)

  if (step === "reset") return shell("Reset your password", `Enter the code we sent to ${state.email.trim()} and choose a new password.`,
    <CodeStep purpose="reset" email={state.email.trim()} code={code} error={fieldErrors.code}
      onCodeChange={(next) => { setCode(next); flow.clearFieldError("code") }}
      resendIn={secondsUntil(nextSendAt, now)} coolingDown={nextSendAt > 0}
      pending={pending === "save" ? "submit" : pending === "send" ? "send" : null} humanCheck={flow.humanCheck}
      onSubmit={() => void act(async () => {
        await flow.save({ code, password })
        // Nothing lingers once the flow ends (today's recovery rule).
        if (flow.snapshot().step === "saved") { setCode(""); setPassword("") }
      })}
      onResend={() => void act(async () => { await flow.resendCode(); if (!flow.snapshot().alert) setCode("") })}
      onUseDifferentEmail={() => { setCode(""); setPassword(""); flow.useDifferentEmail() }}
      fields={<AuthPasswordField id={FIELD_IDS.password} label="New password" name="password" autoComplete="new-password" required
        value={password} description="Use at least 8 characters." error={fieldErrors.password} disabled={pending === "save"}
        onChange={(event) => { setPassword(event.target.value); flow.clearFieldError("password") }} />}
      alert={box} />)

  const requestWait = secondsUntil(nextSendAt, now)
  return shell("Forgot your password?", "Enter the email you use for Lane. We’ll email you a code to reset it.",
    <form className={styles.stack} noValidate onSubmit={(event) => {
      event.preventDefault()
      void act(async () => { await flow.requestCode(); if (flow.snapshot().step === "reset") setCode("") })
    }}>
      <AuthInputField id={FIELD_IDS.email} label="Email address" type="email" name="email" autoComplete="email" required autoFocus
        value={state.email} error={fieldErrors.email} disabled={Boolean(pending)} onChange={(event) => flow.setEmail(event.target.value)} />
      <TurnstileWidget check={flow.humanCheck} />
      {box}
      {/* This address's wait, after Use a different email: shown, not a press that does nothing. A corrected address has none. */}
      <AuthAction type="submit" loading={pending === "send"} disabled={!flow.humanCheck.siteKey} aria-disabled={requestWait > 0 || undefined}>
        <Countdown action="Send reset code" seconds={requestWait} />
      </AuthAction>
    </form>)
}
