import { ClerkFailed, ClerkLoading, SignUp } from "@clerk/nextjs";

import { SignupFrame } from "@/components/auth/auth-frames";
import { AuthCardSkeleton } from "@/components/auth/auth-card-skeleton";
import { ClerkUnavailable } from "@/components/auth/clerk-unavailable";
import { clerkEmbeddedAppearance } from "@/components/auth/clerk-appearance";

export default function SignupPage() {
  return (
    <SignupFrame>
      <SignUp
        routing="hash"
        signInUrl="/login"
        fallbackRedirectUrl="/onboarding"
        appearance={clerkEmbeddedAppearance}
        // Decision 2026-10-21: the skeleton while Clerk loads, a way out once Clerk reports it could not.
        fallback={<><ClerkLoading><AuthCardSkeleton label="Loading account creation" fields={2} /></ClerkLoading><ClerkFailed><ClerkUnavailable title="Sign up is unavailable right now" href="/signup" /></ClerkFailed></>}
      />
    </SignupFrame>
  );
}
