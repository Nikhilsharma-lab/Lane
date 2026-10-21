import { AuthHeaderLink } from "./auth-shell";

/**
 * Plan item 2.11: the recovery pages' way back to /login. /reset-password wraps it
 * in HiddenDuringSessionTask, because during Clerk's reset-password task /login
 * only resumes that task. Like LoginResetLink, it imports no client code.
 */
export function RecoveryLoginLink() {
  return <AuthHeaderLink prompt="Remembered it?" href="/login" label="Sign in" />;
}
