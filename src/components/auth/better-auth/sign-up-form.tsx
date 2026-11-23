"use client"

import { ShieldCheckIcon } from "lucide-react"
import { useState, type ReactNode } from "react"

import { Alert } from "@/components/arc/alert/alert"
import Link from "@/components/link"
import { AuthAction } from "../auth-action"
import { AuthInputField, AuthPasswordField } from "../auth-field"
import { AuthFormCard } from "../auth-form-card"
import { AuthHeaderLink, AuthShell, AuthTrust } from "../auth-shell"
import { signInPage } from "./auth-addresses"
import { useAuthFlow, type FocusOrder } from "./auth-flow-view"
import { CODE_INPUT, CodeStep } from "./code-step"
import { secondsUntil } from "./code-sends"
import { GoogleMark, OrDivider } from "./google-mark"
import { createSignUpFlow, type SignUpFlow, type SignUpState } from "./sign-up-flow"
import { TurnstileWidget } from "./turnstile-widget"
import authStyles from "../auth.module.css"
import styles from "./better-auth.module.css"

const FIELD_IDS = { name: "sign-up-name", email: "sign-up-email", password: "sign-up-password" } as const
const ALERT_ID = "sign-up-alert"

/** #376 story 94: after a refused submit, focus goes to the first field with a problem, or to the box. */
const FOCUS_ORDER: FocusOrder<SignUpState> = [
  ["name", `#${FIELD_IDS.name}`], ["email", `#${FIELD_IDS.email}`], ["password", `#${FIELD_IDS.password}`], ["code", CODE_INPUT],
]

type SignUpProps = { email?: string; returnTo?: string; errorCode?: string }

/**
 * #378 (#376 "The shared auth form", #346 layout A): the auth form's sign-up mode. Continue with Google, then name,
 * email, password, the human check and Create account; then the code step confirms the email, and the flow signs in
 * with the typed password. Dormant: no route mounts it until increment 5.
 */
export function SignUp({ email, returnTo, errorCode }: SignUpProps) {
  // A full page load after signing in, so every server read sees the new session.
  const [flow] = useState<SignUpFlow>(() => createSignUpFlow({ email, returnTo, errorCode, navigate: (path) => window.location.assign(path) }))
  const [password, setPassword] = useState("")
  const [code, setCode] = useState("")
  const { state, now, act } = useAuthFlow(flow, FOCUS_ORDER, ALERT_ID)
  const { step, fieldErrors, alert, pending, nextSendAt } = state

  const box = alert && <Alert tone="danger" title={alert.message} id={ALERT_ID} tabIndex={-1}>
    {alert.offer === "sign-in" && <Link href={signInPage(state.email, returnTo)} className={authStyles.alertLink}>Sign in instead</Link>}
  </Alert>

  const shell = (title: string, description: string, body: ReactNode) => <AuthShell
    headerAction={<AuthHeaderLink prompt="Have an account?" href={signInPage(state.email, returnTo)} label="Sign in" />}
    footer={<AuthTrust icon={ShieldCheckIcon}>Create or join a workspace after confirming your email.</AuthTrust>}>
    <AuthFormCard title={title} description={description}>{body}</AuthFormCard>
  </AuthShell>

  // Proposed for Nikhil (#378): the prototype's "Email confirmed" title, with the spec's "Sign in to continue."
  if (step === "confirmed") return shell("Email confirmed", "Sign in to continue.",
    <AuthAction type="button" onClick={() => flow.goToSignIn()}>Sign in</AuthAction>)

  if (step === "code") return shell("Confirm your email", `Enter the 6-digit code we sent to ${state.email.trim()} to finish creating your account.`,
    <CodeStep purpose="confirm" email={state.email.trim()} code={code} error={fieldErrors.code}
      onCodeChange={(next) => { setCode(next); flow.clearFieldError("code") }}
      resendIn={secondsUntil(nextSendAt, now)} coolingDown={nextSendAt > 0}
      pending={pending === "code" ? "submit" : pending === "send" ? "send" : null} humanCheck={flow.humanCheck}
      onSubmit={() => void act(async () => { await flow.confirmEmail({ code }); if (!flow.holdsPassword()) setCode("") })}
      onResend={() => void act(async () => { await flow.resendCode(); if (!flow.snapshot().alert) setCode("") })}
      onUseDifferentEmail={() => { setCode(""); flow.useDifferentEmail() }}
      alert={box} />)

  return shell("Create your Lane account", "Free during the pilot. You’ll confirm your email with a code.", <div className={styles.stack}>
    <AuthAction type="button" kind="secondary" loading={pending === "google"} onClick={() => void act(flow.continueWithGoogle)}>
      <GoogleMark />Continue with Google
    </AuthAction>
    <OrDivider />
    <form className={styles.stack} noValidate onSubmit={(event) => {
      event.preventDefault()
      // The flow keeps the password from here until the sign-in after confirming, so the field lets it go.
      void act(async () => { await flow.signUp({ password }); if (flow.holdsPassword()) setPassword("") })
    }}>
      <AuthInputField id={FIELD_IDS.name} label="Your name" name="name" autoComplete="name" required autoFocus
        value={state.name} error={fieldErrors.name} disabled={Boolean(pending)} onChange={(event) => flow.setName(event.target.value)} />
      <AuthInputField id={FIELD_IDS.email} label="Email address" type="email" name="email" autoComplete="email" required
        value={state.email} error={fieldErrors.email} disabled={Boolean(pending)} onChange={(event) => flow.setEmail(event.target.value)} />
      <AuthPasswordField id={FIELD_IDS.password} label="Choose a password" name="password" autoComplete="new-password" required value={password}
        description="Use at least 8 characters." error={fieldErrors.password} disabled={Boolean(pending)}
        onChange={(event) => { setPassword(event.target.value); flow.clearFieldError("password") }} />
      <TurnstileWidget check={flow.humanCheck} />
      {box}
      <AuthAction type="submit" loading={pending === "sign-up"} disabled={!flow.humanCheck.siteKey}>Create account</AuthAction>
    </form>
  </div>)
}
