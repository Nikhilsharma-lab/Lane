"use client";

import { LockKeyholeIcon } from "lucide-react";

import { PasswordRecoveryForm } from "@/components/auth/password-recovery-form";
import {
  AuthHeaderLink,
  AuthShell,
  AuthTrust,
} from "@/components/auth/auth-shell";

export default function ForgotPasswordPage() {
  return (
    <AuthShell
      headerAction={
        <AuthHeaderLink prompt="Remembered it?" href="/login" label="Sign in" />
      }
      footer={
        <AuthTrust icon={LockKeyholeIcon} className="justify-center sm:justify-start">
          Reset the password for your Lane account.
        </AuthTrust>
      }
    >
      <PasswordRecoveryForm />
    </AuthShell>
  );
}
