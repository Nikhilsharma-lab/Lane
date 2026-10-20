import { SignUp } from "@clerk/nextjs";

import { SignupFrame } from "@/components/auth/auth-frames";
import { AuthCardSkeleton } from "@/components/auth/auth-loading";
import { clerkEmbeddedAppearance } from "@/components/auth/clerk-appearance";

export default function SignupPage() {
  return (
    <SignupFrame>
      <SignUp
        routing="hash"
        signInUrl="/login"
        fallbackRedirectUrl="/onboarding"
        appearance={clerkEmbeddedAppearance}
        fallback={<AuthCardSkeleton label="Loading account creation" fields={2} />}
      />
    </SignupFrame>
  );
}
