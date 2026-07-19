"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { LockKeyholeIcon } from "lucide-react";
import { login } from "../actions";
import { AuthAction } from "@/components/auth/auth-action";
import {
  AuthInputField,
  AuthPasswordField,
} from "@/components/auth/auth-field";
import {
  AuthHeading,
  AuthHeaderLink,
  AuthShell,
  AuthTrust,
} from "@/components/auth/auth-shell";
import { Feedback } from "@/components/ui/feedback";

function LoginForm() {
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const searchParams = useSearchParams();
  const next = searchParams.get("next");
  const prefillEmail = searchParams.get("email") || "";
  const resetComplete = searchParams.get("reset") === "success";
  const callbackError = searchParams.get("error") === "auth";

  const signupParams = new URLSearchParams();
  if (next) signupParams.set("next", next);
  if (prefillEmail) signupParams.set("email", prefillEmail);
  const signupHref = signupParams.size ? `/signup?${signupParams}` : "/signup";

  const recoveryParams = new URLSearchParams();
  if (prefillEmail) recoveryParams.set("email", prefillEmail);
  if (next) recoveryParams.set("next", next);
  const recoveryHref = recoveryParams.size
    ? `/forgot-password?${recoveryParams}`
    : "/forgot-password";

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setPending(true);

    const result = await login(
      new FormData(event.currentTarget),
      next || undefined
    );

    if (result?.error) {
      setError(result.error);
      setPending(false);
    }
  }

  const visibleError =
    error ||
    (callbackError
      ? "That sign-in link is invalid or has expired. Sign in to continue."
      : null);

  return (
    <AuthShell
      headerAction={
        <AuthHeaderLink
          prompt="New to Lane?"
          href={signupHref}
          label="Create account"
        />
      }
      footer={
        <AuthTrust icon={LockKeyholeIcon} className="justify-center sm:justify-start">
          Private to your workspace. Lane never tracks activity.
        </AuthTrust>
      }
    >
      <div className="space-y-8">
      <AuthHeading
        title="Welcome back"
        description="Sign in to return to your Lane workspace."
      />

      {resetComplete && (
        <Feedback kind="success">
          Your password was updated. Sign in with your new password.
        </Feedback>
      )}

      <form onSubmit={handleSubmit} className="space-y-4" aria-busy={pending}>
        <AuthInputField
          id="email"
          label="Email"
          name="email"
          type="email"
          placeholder="you@company.com"
          defaultValue={prefillEmail}
          required
          autoComplete="email"
          autoFocus
        />

        <AuthPasswordField
          id="password"
          label="Password"
          trailing={
            <Link
              href={recoveryHref}
              className="rounded-sm text-type-label text-muted-foreground outline-none hover:text-foreground hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              Forgot password?
            </Link>
          }
          name="password"
          placeholder="Your password"
          required
          autoComplete="current-password"
          minLength={6}
        />

        {visibleError && (
          <Feedback kind="error" variant="inline">
            {visibleError}
          </Feedback>
        )}

        <AuthAction
          type="submit"
          loading={pending}
          loadingLabel="Signing in…"
        >
          Sign in
        </AuthAction>
      </form>

      <p className="text-center text-type-support text-muted-foreground sm:hidden">
        New to Lane?{" "}
        <Link
          href={signupHref}
          className="rounded-sm font-medium text-foreground outline-none underline-offset-4 hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          Create an account
        </Link>
      </p>
      </div>
    </AuthShell>
  );
}

function LoginFallback() {
  return (
    <div className="space-y-8" aria-label="Loading sign in">
      <div className="space-y-2">
        <div className="h-8 w-48 animate-pulse rounded-md bg-muted motion-reduce:animate-none" />
        <div className="h-5 w-72 max-w-full animate-pulse rounded-md bg-muted motion-reduce:animate-none" />
      </div>
      <div className="h-control-form-touch animate-pulse rounded-lg bg-muted motion-reduce:animate-none sm:h-control-form" />
      <div className="h-control-form-touch animate-pulse rounded-lg bg-muted motion-reduce:animate-none sm:h-control-form" />
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <AuthShell>
          <LoginFallback />
        </AuthShell>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
