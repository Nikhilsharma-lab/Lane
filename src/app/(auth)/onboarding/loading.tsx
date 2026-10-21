import { OnboardingChrome } from "@/components/auth/onboarding-chrome";
import { AuthLoading } from "@/components/auth/auth-loading";
import { OnboardingSignOut } from "@/components/auth/onboarding-sign-out";

export default function OnboardingLoading() {
  return <OnboardingChrome headerAction={<OnboardingSignOut />}><AuthLoading label="Preparing onboarding" roles /></OnboardingChrome>;
}
