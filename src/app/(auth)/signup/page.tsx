import { SignUp } from "@clerk/nextjs";

import { SignupFrame } from "@/components/auth/auth-frames";
import { AuthCardSkeleton } from "@/components/auth/auth-card-skeleton";
import { ClerkLoadFallback } from "@/components/auth/clerk-load-fallback";
import { clerkEmbeddedAppearance } from "@/components/auth/clerk-appearance";

export default function SignupPage() {
  return (
    <SignupFrame>
      <SignUp
        routing="hash"
        signInUrl="/login"
        fallbackRedirectUrl="/onboarding"
        appearance={clerkEmbeddedAppearance}
        fallback={<ClerkLoadFallback skeleton={<AuthCardSkeleton label="Loading account creation" fields={2} />} unavailableTitle="Sign up is unavailable right now" />}
      />
    </SignupFrame>
  );
}
