"use client";

import { useState } from "react";
import { KeyRoundIcon, LockKeyholeIcon } from "lucide-react";
import { updatePassword } from "../actions";
import { AuthAction } from "@/components/auth/auth-action";
import { AuthPasswordField } from "@/components/auth/auth-field";
import {
  AuthHeading,
  AuthKicker,
  AuthTrust,
} from "@/components/auth/auth-shell";
import { Feedback } from "@/components/ui/feedback";

export function ResetPasswordForm() {
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const passwordError =
    error === "Use 8 or more characters for your password" ||
    error === "Password must be 72 characters or fewer"
      ? error
      : null;
  const confirmPasswordError =
    error === "Passwords do not match" ? error : null;
  const formError =
    error && !passwordError && !confirmPasswordError ? error : null;

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setPending(true);

    const result = await updatePassword(new FormData(event.currentTarget));
    if (result?.error) {
      setError(result.error);
      setPending(false);
    }
  }

  return (
    <div className="space-y-8">
      <AuthHeading
        title="Set a new password"
        description="Use 8 or more characters. Choose something you do not reuse elsewhere."
        kicker={<AuthKicker icon={KeyRoundIcon}>SECURE RESET</AuthKicker>}
      />

      <form
        onSubmit={handleSubmit}
        className="space-y-4"
        aria-busy={pending}
      >
        <AuthPasswordField
          id="new-password"
          label="New password"
          name="password"
          placeholder="At least 8 characters"
          required
          minLength={8}
          maxLength={72}
          autoComplete="new-password"
          autoFocus
          description="Use 8 or more characters."
          error={passwordError}
        />

        <AuthPasswordField
          id="confirm-password"
          label="Confirm new password"
          name="confirmPassword"
          placeholder="Repeat your new password"
          required
          minLength={8}
          maxLength={72}
          autoComplete="new-password"
          error={confirmPasswordError}
        />

        {formError && (
          <Feedback kind="error" variant="inline">
            {formError}
          </Feedback>
        )}

        <AuthAction
          type="submit"
          loading={pending}
          loadingLabel="Updating password…"
        >
          Update password
        </AuthAction>
      </form>

      <AuthTrust icon={LockKeyholeIcon}>
        This secure link can be used once.
      </AuthTrust>
    </div>
  );
}
