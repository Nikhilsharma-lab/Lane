import { SignupFrame } from "@/components/auth/auth-frames";
import { AuthCardSkeleton } from "@/components/auth/auth-card-skeleton";

export default function SignupLoading() {
  return <SignupFrame><AuthCardSkeleton label="Loading account creation" fields={2} /></SignupFrame>;
}
