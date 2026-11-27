import { AuthHeaderLink } from "./auth-shell";

/** The recovery pages' way back to /login. */
export function RecoveryLoginLink() {
  return <AuthHeaderLink prompt="Remembered it?" href="/login" label="Sign in" />;
}
