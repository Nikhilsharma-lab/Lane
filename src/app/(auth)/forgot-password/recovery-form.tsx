"use client";

import { useState } from "react";
import Link from "next/link";
import { KeyRoundIcon, MailCheckIcon } from "lucide-react";
import { requestPasswordReset } from "../actions";
import { AuthAction } from "@/components/auth/auth-action";
import { AuthInputField } from "@/components/auth/auth-field";
import { AuthHeading, AuthKicker } from "@/components/auth/auth-shell";
import { Feedback } from "@/components/ui/feedback";

export function RecoveryForm({
  initialEmail,
  next,
}: {
  initialEmail: string;
  next: string;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [sentEmail, setSentEmail] = useState<string | null>(null);

  const loginParams = new URLSearchParams();
  if (next !== "/") loginParams.set("next", next);
  if (initialEmail) loginParams.set("email", initialEmail);
  const loginHref = loginParams.size ? `/login?${loginParams}` : "/login";

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setPending(true);

    const result = await requestPasswordReset(
      new FormData(event.currentTarget)
    );
    if (typeof result.email !== "string") {
      setError(result.error ?? "We couldn’t send a reset link. Try again.");
      setPending(false);
      return;
    }

    setSentEmail(result.email);
    setPending(false);
  }

  if (sentEmail) {
    return (
      <div className="space-y-8">
        <AuthHeading
          title="Check your email"
          kicker={<AuthKicker icon={MailCheckIcon}>PASSWORD RECOVERY</AuthKicker>}
          description={
            <>
              If an account matches{" "}
              <strong className="font-semibold text-foreground">
                {sentEmail}
              </strong>
              , a reset link is on its way.
            </>
          }
        />
        <Feedback kind="info">
          For privacy, Lane won’t confirm whether an email has an account.
          Check spam before trying again.
        </Feedback>
        <div className="space-y-3">
          <AuthAction
            nativeButton={false}
            render={<Link href={loginHref} />}
          >
            Back to sign in
          </AuthAction>
          <AuthAction
            type="button"
            kind="tertiary"
            onClick={() => setSentEmail(null)}
          >
            Try another email
          </AuthAction>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <AuthHeading
        title="Let’s get you back in"
        kicker={<AuthKicker icon={KeyRoundIcon}>PASSWORD RECOVERY</AuthKicker>}
        description="Enter your account email. If it matches an account, we’ll send a secure reset link."
      />

      <form
        onSubmit={handleSubmit}
        className="space-y-4"
        aria-busy={pending}
      >
        <AuthInputField
          id="recovery-email"
          label="Email"
          name="email"
          type="email"
          placeholder="you@company.com"
          defaultValue={initialEmail}
          required
          autoComplete="email"
          autoFocus
          error={error}
        />

        <AuthAction
          type="submit"
          loading={pending}
          loadingLabel="Sending reset link…"
        >
          Send reset link
        </AuthAction>
      </form>

      <AuthAction
        nativeButton={false}
        render={<Link href={loginHref} />}
        kind="tertiary"
      >
        Back to sign in
      </AuthAction>
    </div>
  );
}
