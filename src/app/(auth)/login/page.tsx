"use client";

import { LoginFrame } from "@/components/auth/auth-frames";
import {
  ClerkHashSignIn,
  ClerkSessionTasks,
  SignInResetLink,
} from "@/components/auth/clerk-sign-in";

export default function LoginPage() {
  return (
    <LoginFrame headerAction={<SignInResetLink />}>
      <ClerkSessionTasks fallback={<ClerkHashSignIn />} />
    </LoginFrame>
  );
}
