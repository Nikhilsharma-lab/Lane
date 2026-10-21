"use client";

import { RecoveryFrame } from "@/components/auth/auth-frames";
import { PasswordRecoveryForm } from "@/components/auth/password-recovery-form";
import { RecoveryLoginLink } from "@/components/auth/recovery-login-link";

export default function ForgotPasswordPage() {
  return (
    <RecoveryFrame headerAction={<RecoveryLoginLink />}>
      <PasswordRecoveryForm />
    </RecoveryFrame>
  );
}
