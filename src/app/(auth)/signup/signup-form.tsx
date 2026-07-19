"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { LockKeyholeIcon } from "lucide-react";
import { signup } from "../actions";
import { AuthAction } from "@/components/auth/auth-action";
import { useRecoverableAction } from "@/components/auth/use-recoverable-action";
import {
  AuthInputField,
  AuthPasswordField,
} from "@/components/auth/auth-field";
import { AuthHeading } from "@/components/auth/auth-shell";
import { Feedback } from "@/components/ui/feedback";

export function SignupForm({
  next,
  initialEmail,
  emailLocked,
  workspaceName,
}: {
  next: string;
  initialEmail: string;
  emailLocked: boolean;
  workspaceName?: string;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const { pending, run } = useRecoverableAction();
  const [isNavigating, startNavigation] = useTransition();
  const busy = pending || isNavigating;

  const loginParams = new URLSearchParams();
  if (next !== "/") loginParams.set("next", next);
  if (initialEmail) loginParams.set("email", initialEmail);
  const loginHref = loginParams.size ? `/login?${loginParams}` : "/login";

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const outcome = await run(() =>
      signup(new FormData(event.currentTarget), next)
    );
    if (outcome.status === "failed") {
      setError(
        "Lane couldn’t create your account. Your details are still here—check your connection and try again."
      );
      return;
    }
    if (outcome.status !== "completed") return;

    const result = outcome.value;
    if (result?.error) {
      setError(result.error);
      return;
    }
    if (result?.confirmationRequired) {
      const params = new URLSearchParams({
        email: result.email,
        next: result.next,
      });
      startNavigation(() => {
        router.push(`/signup/check-email?${params}`);
      });
    }
  }

  return (
    <div className="space-y-8">
      <AuthHeading
        title={
          emailLocked && workspaceName
            ? `You’re invited to ${workspaceName}`
            : "Welcome to Lane"
        }
        description={
          emailLocked
            ? "Create your account to continue into your team’s shared Request workspace."
            : "Create your account to join your team and start with clearer Requests."
        }
      />

      {emailLocked && workspaceName && (
        <div className="flex items-center gap-3 border-y py-[13px]">
          <span className="flex size-[34px] shrink-0 items-center justify-center rounded-lg bg-primary text-type-label font-semibold text-primary-foreground">
            {workspaceName.slice(0, 1).toUpperCase()}
          </span>
          <div className="min-w-0">
            <p className="truncate text-type-control font-semibold">{workspaceName}</p>
            <p className="text-type-meta text-muted-foreground">Workspace invitation</p>
          </div>
        </div>
      )}

      <form
        onSubmit={handleSubmit}
        className="space-y-4"
        aria-busy={busy}
      >
        <AuthInputField
          id="fullName"
          label="Full name"
          name="fullName"
          type="text"
          placeholder="Your name"
          required
          autoComplete="name"
          autoFocus
        />

        <AuthInputField
          id="email"
          label={emailLocked ? "Email" : "Work email"}
          name="email"
          type="email"
          placeholder="you@company.com"
          defaultValue={initialEmail}
          readOnly={emailLocked}
          required
          autoComplete="email"
          description={
            emailLocked
              ? "This invite is tied to this email address."
              : undefined
          }
          endIcon={emailLocked ? LockKeyholeIcon : undefined}
        />

        <AuthPasswordField
          id="password"
          label="Password"
          name="password"
          placeholder="At least 8 characters"
          required
          autoComplete="new-password"
          minLength={8}
          maxLength={72}
          description="Use 8 or more characters."
        />

        {error && (
          <Feedback kind="error" variant="inline">
            {error}
          </Feedback>
        )}

        <AuthAction
          type="submit"
          loading={busy}
          loadingLabel={
            isNavigating ? "Opening email instructions…" : "Creating account…"
          }
        >
          {emailLocked ? "Create account and continue" : "Create account"}
        </AuthAction>
      </form>

      <p className="text-center text-type-support text-muted-foreground sm:hidden">
        Already have an account?{" "}
        <Link
          href={loginHref}
          className="rounded-sm font-medium text-foreground outline-none underline-offset-4 hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          Sign in
        </Link>
      </p>
    </div>
  );
}
