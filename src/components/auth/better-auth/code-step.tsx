"use client"

import type { ReactNode } from "react"

import { OtpInput } from "@/components/arc/otp-input/otp-input"
import type { CodePurpose } from "@/lib/auth-client"
import { CODE_LENGTH, CODE_LIFETIME_MINUTES } from "@/lib/auth-code-rules"
import { AuthAction } from "../auth-action"
import type { HumanCheck } from "./human-check"
import { TurnstileWidget } from "./turnstile-widget"
import styles from "./better-auth.module.css"

const LABEL: Record<CodePurpose, string> = { "sign-in": "Sign-in code", confirm: "Confirmation code", reset: "Reset code" }
const ACTION: Record<CodePurpose, string> = { "sign-in": "Sign in", confirm: "Confirm email", reset: "Save new password" }
/** Whether the step's own submit sends a Turnstile token: only the reset's save does (increment 3's server). */
const SUBMIT_NEEDS_CHECK: Record<CodePurpose, boolean> = { "sign-in": false, confirm: false, reset: true }

/** Wraps the code boxes, so a screen can put focus on the first one after a refused code. */
export const CODE_FIELD_ID = "code-step-code"
/** The first code box, which takes focus after a refused code. */
export const CODE_INPUT = `#${CODE_FIELD_ID} input`

/**
 * #290 D12: the seconds change on screen only. The button's name stays the action while it waits, and the words on
 * screen start with that name (WCAG 2.5.3).
 */
export function Countdown({ action, seconds }: { action: string; seconds: number }) {
  if (seconds === 0) return action
  return <><span aria-hidden="true">{`${action} in ${seconds}s`}</span><span className="sr-only">{action}</span></>
}

export type CodeStepProps = {
  purpose: CodePurpose
  email: string
  code: string
  onCodeChange: (code: string) => void
  /** The code field's line, such as a wrong or expired code. */
  error?: string
  /** Seconds before Send a new code is offered. */
  resendIn: number
  /** A code was sent, so a resend wait has started (it may have ended). */
  coolingDown: boolean
  pending: "submit" | "send" | null
  /** A resend needs a fresh token, so the widget sits on this step too. */
  humanCheck: HumanCheck
  onSubmit: () => void
  onResend: () => void
  onUseDifferentEmail: () => void
  /** Fields after the code, such as the reset's new password. */
  fields?: ReactNode
  /** The box for a line with no field, under the human check. */
  alert?: ReactNode
}

/**
 * #377 (#376 "The shared code step"): Arc's six code boxes for signing in, confirming an email or resetting a
 * password. Its label and button follow `purpose`. It says where the code went and how long it lasts, offers Send a
 * new code 30 s after the last send and Use a different email. Field values and the wait come from the screen.
 */
export function CodeStep({ purpose, email, code, onCodeChange, error, resendIn, coolingDown, pending, humanCheck, onSubmit, onResend,
  onUseDifferentEmail, fields, alert }: CodeStepProps) {
  const waiting = resendIn > 0
  const canResend = !waiting && !pending && Boolean(humanCheck.siteKey)
  return <form className={styles.stack} noValidate onSubmit={(event) => {
    event.preventDefault()
    if (!pending) onSubmit()
  }}>
    <div id={CODE_FIELD_ID}>
      <OtpInput label={LABEL[purpose]} length={CODE_LENGTH} value={code} onChange={onCodeChange} autoFocus error={error}
        description={`The code works for ${CODE_LIFETIME_MINUTES} minutes.`} disabled={pending === "submit"} />
    </div>
    <p className={styles.small}>Sent to {email}. Check spam if it isn’t there within a minute.</p>
    {fields}
    <TurnstileWidget check={humanCheck} />
    {alert}
    <AuthAction type="submit" loading={pending === "submit"} disabled={SUBMIT_NEEDS_CHECK[purpose] && !humanCheck.siteKey}>{ACTION[purpose]}</AuthAction>
    <div className={styles.actions}>
      {/* Unavailable while it waits, but focusable, so a keyboard press keeps its place. */}
      <AuthAction type="button" kind="tertiary" loading={pending === "send"} aria-disabled={!canResend || undefined}
        onClick={() => { if (canResend) onResend() }}>
        <Countdown action="Send a new code" seconds={resendIn} />
      </AuthAction>
      <AuthAction type="button" kind="tertiary" disabled={Boolean(pending)} onClick={onUseDifferentEmail}>Use a different email</AuthAction>
    </div>
    {/* #290 D12: the wait is announced once, when it ends, not every second. */}
    <p role="status" className="sr-only">{coolingDown && !waiting ? "You can send a new code now." : ""}</p>
  </form>
}
