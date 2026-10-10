import { SignUp } from "@clerk/nextjs";
import { ShieldCheckIcon } from "lucide-react";

import { AuthShell, AuthTrust } from "@/components/auth/auth-shell";

import { clerkEmbeddedAppearance } from "@/components/auth/clerk-appearance";

export default function SignupPage() {
  return (
    <AuthShell
      footer={
        <AuthTrust icon={ShieldCheckIcon} className="justify-center sm:justify-start">
          Create or join a workspace after signing up.
        </AuthTrust>
      }
    >
      <SignUp
        routing="hash"
        signInUrl="/login"
        fallbackRedirectUrl="/onboarding"
        appearance={clerkEmbeddedAppearance}
      />
    </AuthShell>
  );
}
