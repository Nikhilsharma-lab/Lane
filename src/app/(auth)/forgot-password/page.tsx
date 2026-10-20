"use client";

import { RecoveryFrame } from "@/components/auth/auth-frames";
import { PasswordRecoveryForm } from "@/components/auth/password-recovery-form";

export default function ForgotPasswordPage() {
  return (
    <RecoveryFrame>
      <PasswordRecoveryForm />
    </RecoveryFrame>
  );
}
