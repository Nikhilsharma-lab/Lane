import { OnboardingChrome } from "@/components/auth/onboarding-chrome";
import { AuthLoading } from "@/components/auth/auth-loading";
import { BetterAuthSignOut } from "@/components/auth/better-auth/sign-out";

export default function OnboardingLoading() {
  return <OnboardingChrome headerAction={<BetterAuthSignOut />}><AuthLoading label="Preparing onboarding" roles /></OnboardingChrome>;
}
