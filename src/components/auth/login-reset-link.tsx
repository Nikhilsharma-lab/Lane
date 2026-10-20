import { AuthHeaderLink } from "./auth-shell";

/**
 * Plan item 2.11: /login's reset link. The page wraps it in HiddenDuringSessionTask
 * and its loading state in a concealed AuthHeaderSlot. This module imports no
 * client code, so the loading state's chunk carries no Clerk session check.
 */
export function LoginResetLink() {
  return <AuthHeaderLink prompt="Forgot your password?" href="/forgot-password" label="Reset it" />;
}
