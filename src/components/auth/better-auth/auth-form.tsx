"use client"

import { ShieldCheckIcon } from "lucide-react"
import { useState } from "react"

import { Alert } from "@/components/arc/alert/alert"
import Link from "@/components/link"
import { SIGN_UP_URL } from "@/lib/session-task-urls"
import { AuthAction } from "../auth-action"
import { AuthInputField, AuthPasswordField } from "../auth-field"
import { AuthFormCard } from "../auth-form-card"
import { AuthHeaderLink, AuthShell, AuthTrust } from "../auth-shell"
import { signUpPage } from "./auth-addresses"
import { useAuthFlow, type FocusOrder } from "./auth-flow-view"
import { CODE_INPUT, CodeStep } from "./code-step"
import { secondsUntil } from "./code-sends"
import { GoogleMark, OrDivider } from "./google-mark"
import { createSignInFlow, type SignInFlow, type SignInState } from "./sign-in-flow"
import { SignUp } from "./sign-up-form"
import { TurnstileWidget } from "./turnstile-widget"
import authStyles from "../auth.module.css"
import styles from "./better-auth.module.css"

/** Which screen the shared form draws. Sign-up mode joined in #378 without changing the props. */
export type AuthFormMode = "sign-in" | "sign-up"

export type AuthFormProps = {
  mode: AuthFormMode
  /** An email to start with, such as the invitation's. */
  email?: string
  /** Where to go after signing in; only a path within Lane is followed, anything else goes to `/`. */
  returnTo?: string
  /** The `error` on Google's redirect back to this screen. */
  errorCode?: string
}

const FIELD_IDS = { email: "sign-in-email", password: "sign-in-password" } as const
const ALERT_ID = "sign-in-alert"

/**
 * #377 (#376 "The shared auth form", #346 layout A): Lane's own sign-in, through Lane's browser auth client. Continue
 * with Google first, then email and password, with Forgot password? under the password and "Email me a sign-in code
 * instead". Dormant: no route mounts it until increment 5.
 */
export function AuthForm(props: AuthFormProps) {
  return props.mode === "sign-up" ? <SignUp {...props} /> : <SignIn {...props} />
}

/** #376 story 94: after a refused submit, focus goes to the first field with a problem, or to the box. */
const FOCUS_ORDER: FocusOrder<SignInState> = [["email", `#${FIELD_IDS.email}`], ["password", `#${FIELD_IDS.password}`], ["code", CODE_INPUT]]

function SignIn({ email, returnTo, errorCode }: AuthFormProps) {
  // A full page load after signing in, so every server read sees the new session.
  const [flow] = useState<SignInFlow>(() => createSignInFlow({ email, returnTo, errorCode, navigate: (path) => window.location.assign(path) }))
  const [password, setPassword] = useState("")
  const [code, setCode] = useState("")
  const { state, now, act } = useAuthFlow(flow, FOCUS_ORDER, ALERT_ID)
  const { step, fieldErrors, alert, pending, nextSendAt } = state

  const box = alert && <Alert tone="danger" title={alert.message} id={ALERT_ID} tabIndex={-1}>
    {alert.offer === "sign-up" && <Link href={signUpPage(state.email, returnTo)} className={authStyles.alertLink}>Sign up instead</Link>}
    {alert.offer === "code" && <button type="button" className={styles.textLink} onClick={() => flow.useCode()}>Email me a sign-in code</button>}
  </Alert>

  const emailField = <AuthInputField id={FIELD_IDS.email} label="Email address" type="email" name="email" autoComplete="email" required autoFocus
    value={state.email} error={fieldErrors.email} disabled={Boolean(pending)} onChange={(event) => flow.setEmail(event.target.value)} />

  const shell = (title: string, description: string, body: React.ReactNode) => <AuthShell
    headerAction={<AuthHeaderLink prompt="New to Lane?" href={SIGN_UP_URL} label="Create an account" />}
    footer={<AuthTrust icon={ShieldCheckIcon}>Lane opens the workspace you used last.</AuthTrust>}>
    <AuthFormCard title={title} description={description}>{body}</AuthFormCard>
  </AuthShell>

  if (step === "code") return shell("Check your email", `Enter the 6-digit code we sent to ${state.email.trim()}.`,
    <CodeStep purpose="sign-in" email={state.email.trim()} code={code} error={fieldErrors.code}
      onCodeChange={(next) => { setCode(next); flow.clearFieldError("code") }}
      resendIn={secondsUntil(nextSendAt, now)} coolingDown={nextSendAt > 0}
      pending={pending === "code" ? "submit" : pending === "send" ? "send" : null} humanCheck={flow.humanCheck}
      onSubmit={() => void act(() => flow.signInWithCode({ code }))}
      onResend={() => void act(async () => { await flow.resendCode(); if (!flow.snapshot().alert) setCode("") })}
      onUseDifferentEmail={() => { setCode(""); flow.useDifferentEmail() }}
      alert={box} />)

  if (step === "code-request") return shell("Sign in with a code", "We’ll email you a 6-digit code. No password needed.",
    <form className={styles.stack} noValidate onSubmit={(event) => {
      event.preventDefault()
      void act(async () => { await flow.sendCode(); if (flow.snapshot().step === "code") setCode("") })
    }}>
      {emailField}
      <TurnstileWidget check={flow.humanCheck} />
      {box}
      <AuthAction type="submit" loading={pending === "send"} disabled={!flow.humanCheck.siteKey}>Email me a code</AuthAction>
      <button type="button" className={styles.textLink} onClick={() => flow.usePassword()}>Use your password instead</button>
    </form>)

  return shell("Sign in to Lane", "Welcome back.", <div className={styles.stack}>
    <AuthAction type="button" kind="secondary" loading={pending === "google"} onClick={() => void act(flow.continueWithGoogle)}>
      <GoogleMark />Continue with Google
    </AuthAction>
    <OrDivider />
    <form className={styles.stack} noValidate onSubmit={(event) => {
      event.preventDefault()
      void act(() => flow.signInWithPassword({ password }))
    }}>
      {emailField}
      <AuthPasswordField id={FIELD_IDS.password} label="Password" name="password" autoComplete="current-password" required value={password}
        error={fieldErrors.password} disabled={Boolean(pending)}
        onChange={(event) => { setPassword(event.target.value); flow.clearFieldError("password") }}
        trailing={<Link href="/forgot-password" className={authStyles.link}>Forgot password?</Link>} />
      {box}
      <AuthAction type="submit" loading={pending === "password"}>Sign in</AuthAction>
    </form>
    <button type="button" className={styles.textLink} onClick={() => flow.useCode()}>Email me a sign-in code instead</button>
  </div>)
}
