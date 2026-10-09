import { AuthShell } from "@/components/auth/auth-shell";
import { AuthLoading } from "@/components/auth/auth-loading";

export default function SignupLoading() {
  return <AuthShell><AuthLoading label="Loading account creation" /></AuthShell>;
}
