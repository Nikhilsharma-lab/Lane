"use client";

import { AuthAction } from "./auth-action";
import { AuthInputField, AuthPasswordField } from "./auth-field";
import { AuthFormCard } from "./auth-form-card";
import { Alert } from "@/components/arc/alert/alert";
import styles from "./auth.module.css";
import type { RecoveryFieldErrors } from "./password-recovery-flow";

/** D12 (#290): the seconds change on screen only. The button's name stays the action, unavailable until the wait ends. */
function Countdown({ action, waiting, seconds }: { action: string; waiting: string; seconds: number }) {
  if (seconds === 0) return action;
  return <><span aria-hidden="true">{`${waiting} in ${seconds}s`}</span><span className="sr-only">{action}</span></>;
}

export type PasswordRecoveryViewProps = {
  step: "request" | "code" | "activate" | "continue";
  email: string; code: string; password: string; error: string | null; fieldErrors: RecoveryFieldErrors; notice: string | null;
  /** A code was sent, so a resend wait has started (it may have ended). */
  coolingDown: boolean;
  sending: boolean; pending: boolean; isLoaded: boolean; resendIn: number;
  setEmail: (value: string) => void; setCode: (value: string) => void; setPassword: (value: string) => void;
  performAction: (sendCode?: boolean) => Promise<void>; onChangeEmail: () => void;
};

export function PasswordRecoveryView({ step, email, code, password, error, fieldErrors, notice, coolingDown, pending, isLoaded, resendIn,
  setEmail, setCode, setPassword, performAction, onChangeEmail }: PasswordRecoveryViewProps) {
  return (
      <AuthFormCard
        title={
          step === "request"
            ? "Forgot your password?"
            : step === "code"
              ? "Reset your password"
              : "Finish signing in"
        }
        description={
          step === "request"
            ? "Enter the email address you use for Lane. We’ll email you a reset code."
            : step === "code"
              ? `Enter the code sent to ${email.trim()} and choose a new password.`
              : step === "activate"
                ? "Your password has been updated. Continue to finish signing in."
                : "Continue to complete any remaining security checks."
        }
      >
    <form
      className={styles.recoveryForm}
      // D11 (#290): Lane's own form says empty and bad-format input on the field, not in the browser's tooltip.
      noValidate
      onSubmit={async (event) => {
        event.preventDefault();
        await performAction(step === "request");
      }}
    >
      {/* Fields, notices and errors, then the actions --space-8 below them, as in Clerk's form. */}
      {(step === "request" || step === "code" || error) && (
        <div className={styles.recoveryFields}>
          {step === "request" && (
            <AuthInputField
              id="recovery-email"
              label="Email address"
              type="email"
              name="email"
              autoComplete="email"
              required
              disabled={pending}
              autoFocus
              value={email}
              error={fieldErrors.email}
              onChange={(event) => setEmail(event.target.value)}
            />
          )}
          {step === "code" && (
            <>
              <AuthInputField
                id="recovery-code"
                label="Reset code"
                name="code"
                inputMode="numeric"
                autoComplete="one-time-code"
                required
                disabled={pending}
                autoFocus
                value={code}
                error={fieldErrors.code}
                onChange={(event) => setCode(event.target.value)}
              />
              <AuthPasswordField
                id="recovery-password"
                label="New password"
                name="password"
                autoComplete="new-password"
                required
                disabled={pending}
                value={password}
                error={fieldErrors.password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </>
          )}

          {notice && step === "code" && !error && (
            <p role="status" className={styles.notice}>
              {notice}
            </p>
          )}

          {error && (
            <Alert tone="danger" title={error} />
          )}
        </div>
      )}

      <div className={styles.recoveryActionGroup}>
        <AuthAction
          type="submit"
          disabled={!isLoaded || (step === "request" && resendIn > 0)}
          loading={pending}
        >
          {step === "request"
            ? <Countdown action="Send reset code" waiting="Send code" seconds={resendIn} />
            : step === "code"
              ? "Save new password"
              : step === "continue"
                ? "Continue verification"
                : "Continue"}
        </AuthAction>

        {step === "code" && (
          <div className={styles.recoveryActions}>
            {/* Unavailable while sending and through the cooldown, but focusable, so a keyboard press of Resend keeps its place. */}
            <AuthAction
              type="button"
              kind="secondary"
              disabled={!isLoaded}
              aria-disabled={pending || resendIn > 0 || undefined}
              onClick={() => { if (!pending && resendIn === 0) void performAction(true); }}
            >
              <Countdown action="Resend code" waiting="Resend code" seconds={resendIn} />
            </AuthAction>
            <AuthAction
              type="button"
              kind="tertiary"
              disabled={pending}
              onClick={() => {
                onChangeEmail();
              }}
            >
              Change email
            </AuthAction>
          </div>
        )}
        {/* D12 (#290): the wait is announced once, when it ends, not every second. */}
        <p role="status" className="sr-only">{coolingDown && resendIn === 0 ? "You can send a new code now." : ""}</p>
      </div>
    </form>
    </AuthFormCard>
  );
}
