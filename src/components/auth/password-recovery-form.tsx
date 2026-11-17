"use client";

import { useSignIn } from "@clerk/nextjs/legacy";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { createPasswordRecoveryFlow, recoveryErrorField, recoveryInputErrors, type RecoveryField, type RecoveryFieldErrors } from "@/components/auth/password-recovery-flow";
import { PasswordRecoveryView } from "./password-recovery-view";
import { useRecoverableAction } from "@/hooks/use-recoverable-action";

function recoveryErrorMessage(error: unknown) {
  if (
    error &&
    typeof error === "object" &&
    "errors" in error &&
    Array.isArray(error.errors) &&
    typeof error.errors[0]?.longMessage === "string"
  ) {
    return error.errors[0].longMessage;
  }
  return "Couldn’t complete the password reset. Try again.";
}

const FIELD_IDS: Record<RecoveryField, string> = { email: "recovery-email", code: "recovery-code", password: "recovery-password" };
const STEP_FIELDS: Record<string, readonly RecoveryField[]> = { request: ["email"], code: ["code", "password"] };

export function PasswordRecoveryForm() {
  const { isLoaded, signIn, setActive } = useSignIn();
  const router = useRouter();
  const [flow] = useState(() => createPasswordRecoveryFlow());
  const [recovery, setRecovery] = useState(() => flow.snapshot());
  const [now, setNow] = useState(() => Date.now());
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<RecoveryFieldErrors>({});
  const [notice, setNotice] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const { pending, run } = useRecoverableAction();
  const { step } = recovery;
  const resendIn = Math.max(0, Math.ceil((recovery.nextSendAt - now) / 1000));

  useEffect(() => {
    if (!recovery.nextSendAt) return;
    const timer = window.setInterval(() => {
      const time = Date.now();
      setNow(time);
      if (time >= recovery.nextSendAt) window.clearInterval(timer);
    }, 1000);
    return () => window.clearInterval(timer);
  }, [recovery.nextSendAt]);

  function navigate(url: string) {
    // Clerk's Safari cookie-repair decoration can require a full navigation.
    if (/^https?:\/\//.test(url)) window.location.assign(url);
    else router.replace(url);
  }

  async function performAction(sendCode = false) {
    if (!isLoaded || !signIn || !setActive || pending) return;
    // D11 (#290): a resend sends the address already accepted; every other submit checks its step's fields first.
    const invalid = sendCode && step === "code" ? {} : recoveryInputErrors(step, { email, code, password });
    const firstInvalid = (STEP_FIELDS[step] ?? []).find(field => invalid[field]);
    setFieldErrors(invalid);
    setError(null);
    if (firstInvalid) {
      document.getElementById(FIELD_IDS[firstInvalid])?.focus();
      return;
    }
    setNotice(null);
    setSending(sendCode);
    const outcome = await run(async () => {
      if (sendCode) {
        const sent = await flow.sendCode(signIn, email);
        if (sent) {
          setCode("");
          if (flow.snapshot().step === "code") {
            setNotice("A reset code has been sent. Use the most recent email.");
          }
        }
      } else if (flow.snapshot().step === "code") {
        await flow.verify(signIn, { code: code.trim(), password });
      }

      const current = flow.snapshot();
      if (current.step === "activate") {
        setCode("");
        setPassword("");
        await flow.finish(setActive, navigate);
      } else if (current.step === "continue") {
        setCode("");
        setPassword("");
        // Client navigation keeps the same Clerk client and pending sign-in.
        // /login renders Clerk's managed hash router for remaining factors.
        navigate(current.continuationUrl ?? "/login");
      }
    });
    setRecovery(flow.snapshot());
    setNow(Date.now());
    if (outcome.status === "failed") {
      const after = flow.snapshot().step;
      if (after === "activate") {
        setError("Your password was updated, but sign-in did not finish. Continue to try again.");
        return;
      }
      // D16 (#290): an error Clerk ties to a field on this step sits on that field.
      const field = recoveryErrorField(outcome.error);
      if (field && STEP_FIELDS[after]?.includes(field)) setFieldErrors({ [field]: recoveryErrorMessage(outcome.error) });
      else setError(recoveryErrorMessage(outcome.error));
    }
  }

  /** Editing a field clears the message about it. */
  const edit = (field: RecoveryField, set: (value: string) => void) => (value: string) => {
    set(value);
    setFieldErrors(current => (current[field] ? { ...current, [field]: undefined } : current));
  };

  return <PasswordRecoveryView step={step} email={email} code={code} password={password} error={error} fieldErrors={fieldErrors} notice={notice}
    sending={sending} pending={pending} isLoaded={isLoaded} resendIn={resendIn} coolingDown={recovery.nextSendAt > 0}
    setEmail={edit("email", setEmail)} setCode={edit("code", setCode)} setPassword={edit("password", setPassword)} performAction={performAction}
    onChangeEmail={() => {
      if (!flow.changeEmail()) return;
      setCode(""); setPassword(""); setError(null); setFieldErrors({}); setNotice(null); setRecovery(flow.snapshot());
    }} />;
}

