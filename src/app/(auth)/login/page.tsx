"use client";

import { LockKeyholeIcon } from "lucide-react";

import {
  ClerkHashSignIn,
  ClerkSessionTasks,
} from "@/components/auth/clerk-sign-in";
import {
  AuthHeaderLink,
  AuthShell,
  AuthTrust,
} from "@/components/auth/auth-shell";

export default function LoginPage() {
  return (
    <AuthShell
      headerAction={
        <AuthHeaderLink
          prompt="Forgot your password?"
          href="/forgot-password"
          label="Reset it"
        />
      }
      footer={
        <AuthTrust icon={LockKeyholeIcon} className="justify-center sm:justify-start">
          Sign in to access your Lane workspace.
        </AuthTrust>
      }
    >
      <ClerkSessionTasks fallback={<ClerkHashSignIn />} />
    </AuthShell>
  );
}
