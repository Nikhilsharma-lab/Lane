"use client";

import { RecoveryFrame } from "@/components/auth/auth-frames";
import { ClerkSessionTasks } from "@/components/auth/clerk-sign-in";
import { PasswordRecoveryForm } from "@/components/auth/password-recovery-form";
import { RecoveryLoginLink } from "@/components/auth/recovery-login-link";
import { HiddenDuringSessionTask } from "@/components/auth/session-task-gate";

// During Clerk's reset-password task, /login only resumes the task, so the way back is hidden.
export default function ResetPasswordPage() {
  return (
    <RecoveryFrame headerAction={<HiddenDuringSessionTask><RecoveryLoginLink /></HiddenDuringSessionTask>}>
      <ClerkSessionTasks fallback={<PasswordRecoveryForm />} />
    </RecoveryFrame>
  );
}
