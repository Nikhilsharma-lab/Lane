import { LoginFrame } from "@/components/auth/auth-frames";
import { AuthCardSkeleton } from "@/components/auth/auth-loading";
import { SignInResetLink } from "@/components/auth/clerk-sign-in";

// Plan item 2.11: the same frame and card shape as the page and Clerk's fallback.
export default function LoginLoading() {
  return <LoginFrame headerAction={<SignInResetLink />}><AuthCardSkeleton label="Loading sign in" /></LoginFrame>;
}
