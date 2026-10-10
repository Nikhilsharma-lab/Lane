"use client";

import { useSignIn } from "@clerk/nextjs/legacy";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { createPasswordRecoveryFlow } from "@/components/auth/password-recovery-flow";
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
  return "Could not complete the password reset. Try again.";
}

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
    setError(null);
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
      setError(
        flow.snapshot().step === "activate"
          ? "Your password was updated, but sign-in did not finish. Continue to try again."
          : recoveryErrorMessage(outcome.error)
      );
    }
  }

  return <PasswordRecoveryView step={step} email={email} code={code} password={password} error={error} notice={notice}
    sending={sending} pending={pending} isLoaded={isLoaded} resendIn={resendIn}
    setEmail={setEmail} setCode={setCode} setPassword={setPassword} performAction={performAction}
    onChangeEmail={() => {
      if (!flow.changeEmail()) return;
      setCode(""); setPassword(""); setError(null); setNotice(null); setRecovery(flow.snapshot());
    }} />;
}

