"use client";

import { RecoveryFrame } from "@/components/auth/auth-frames";
import { ClerkSessionTasks } from "@/components/auth/clerk-sign-in";
import { PasswordRecoveryForm } from "@/components/auth/password-recovery-form";

export default function ResetPasswordPage() {
  return (
    <RecoveryFrame>
      <ClerkSessionTasks fallback={<PasswordRecoveryForm />} />
    </RecoveryFrame>
  );
}
