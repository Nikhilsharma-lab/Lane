import { LoginFrame } from "@/components/auth/auth-frames";
import { AuthCardSkeleton } from "@/components/auth/auth-card-skeleton";
import { AuthHeaderSlot } from "@/components/auth/auth-header-slot";
import { LoginResetLink } from "@/components/auth/login-reset-link";

// Plan item 2.11: the same frame and card shape as the page and Clerk's fallback.
// The reset link holds its place, hidden, as the page keeps it until Clerk loads;
// no session check here, so this state ships no Clerk code of its own.
export default function LoginLoading() {
  return <LoginFrame headerAction={<AuthHeaderSlot concealed><LoginResetLink /></AuthHeaderSlot>}>
    <AuthCardSkeleton label="Loading sign in" />
  </LoginFrame>;
}
