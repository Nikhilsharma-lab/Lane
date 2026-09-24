import { SignUp } from "@clerk/nextjs";
import { ShieldCheckIcon } from "lucide-react";

import { AuthShell, AuthTrust } from "@/components/auth/auth-shell";

const embeddedAppearance = {
  elements: {
    rootBox: "w-full",
    cardBox: "w-full border-0 shadow-none bg-transparent",
    card: "w-full border-0 shadow-none bg-transparent p-0",
  },
};

export default function SignupPage() {
  return (
    <AuthShell
      footer={
        <AuthTrust icon={ShieldCheckIcon} className="justify-center sm:justify-start">
          No trial pressure. No people analytics.
        </AuthTrust>
      }
    >
      <SignUp
        routing="hash"
        signInUrl="/login"
        fallbackRedirectUrl="/onboarding"
        appearance={embeddedAppearance}
      />
    </AuthShell>
  );
}
