"use client";

import { AuthAction } from "./auth-action";
import { AuthInputField, AuthPasswordField } from "./auth-field";
import { AuthFormCard } from "./auth-form-card";
import { Alert } from "@/components/arc/alert/alert";
import styles from "./auth.module.css";

export type PasswordRecoveryViewProps = {
  step: "request" | "code" | "activate" | "continue";
  email: string; code: string; password: string; error: string | null; notice: string | null;
  sending: boolean; pending: boolean; isLoaded: boolean; resendIn: number;
  setEmail: (value: string) => void; setCode: (value: string) => void; setPassword: (value: string) => void;
  performAction: (sendCode?: boolean) => Promise<void>; onChangeEmail: () => void;
};

export function PasswordRecoveryView({ step, email, code, password, error, notice, sending, pending, isLoaded, resendIn,
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
      className="grid gap-6"
      onSubmit={async (event) => {
        event.preventDefault();
        await performAction(step === "request");
      }}
    >


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

      <AuthAction
        type="submit"
        disabled={!isLoaded || (step === "request" && resendIn > 0)}
        loading={pending}
        loadingLabel={
          sending ? "Sending code…" : step === "code" ? "Saving password…" : "Continuing…"
        }
      >
        {step === "request"
          ? resendIn > 0 ? `Send code in ${resendIn}s` : "Send reset code"
          : step === "code"
            ? "Save new password"
            : step === "continue"
              ? "Continue verification"
              : "Continue"}
      </AuthAction>

      {step === "code" && (
        <div className="grid gap-2 sm:grid-cols-2">
          <AuthAction
            type="button"
            kind="secondary"
            disabled={!isLoaded || pending || resendIn > 0}
            onClick={() => performAction(true)}
          >
            {resendIn > 0 ? `Resend code in ${resendIn}s` : "Resend code"}
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
    </form>
    </AuthFormCard>
  );
}
