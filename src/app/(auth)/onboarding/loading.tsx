import { OnboardingChrome } from "@/components/auth/onboarding-chrome";
import { AuthLoading } from "@/components/auth/auth-loading";

export default function OnboardingLoading() {
  return <OnboardingChrome><AuthLoading label="Preparing onboarding" roles /></OnboardingChrome>;
}
