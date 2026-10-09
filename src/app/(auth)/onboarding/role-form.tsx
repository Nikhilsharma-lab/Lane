"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { AuthAction } from "@/components/auth/auth-action";
import { OnboardingChrome } from "@/components/auth/onboarding-chrome";
import { Alert } from "@/components/arc/alert/alert";
import { AuthFormCard } from "@/components/auth/auth-form-card";
import { RoleSelection, type FunctionalRole } from "@/components/auth/role-selection";
import { useRecoverableAction } from "@/hooks/use-recoverable-action";
import { saveOnboardingRole } from "./actions";

export function RoleForm() {
  const router = useRouter();
  const [role, setRole] = useState<FunctionalRole | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { pending, run } = useRecoverableAction();

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!role) {
      setError("Choose a role to continue.");
      return;
    }

    setError(null);
    const outcome = await run(() => saveOnboardingRole({ role }));
    if (outcome.status === "blocked") return;
    if (outcome.status === "failed") {
      setError(
        "Your role selection is still here. Check your connection and try again."
      );
      return;
    }

    if (outcome.value.error) {
      setError(outcome.value.error);
      return;
    }

    router.refresh();
  }

  return (
    <OnboardingChrome current={2} total={2}>
      <AuthFormCard title="How do you work?" description="Choose your role. You can change it in Profile settings. It does not change what you can see or do.">
        <form onSubmit={submit} className="grid gap-6" noValidate>
          <RoleSelection value={role} disabled={pending} invalid={Boolean(error)} onValueChange={(value) => { setRole(value); setError(null); }} />
          {error && <Alert tone="danger" title={error} />}
          <AuthAction type="submit" loading={pending} loadingLabel="Saving role…">Continue</AuthAction>
        </form>
      </AuthFormCard>
    </OnboardingChrome>
  );
}
