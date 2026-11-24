"use client"

import * as auth from "@/lib/auth-client"
import { SIGN_IN_URL } from "@/lib/auth-return-address"
import { SignOutLink } from "../sign-out-link"

/** Signs out through Lane's browser auth client, then goes to `path`; throws when the sign-out didn't happen. */
export async function signOutThenGo(path: string, navigate: (path: string) => void) {
  const answer = await auth.signOut()
  if (!answer.ok) throw new Error(`Sign-out refused: ${answer.code ?? "no answer"}`)
  navigate(path)
}

/** Signs out and opens sign-in, with a full page load, so the server sees no session and nothing stays on screen. */
export const signOutToSignIn = () => signOutThenGo(SIGN_IN_URL, (path) => window.location.assign(path))

/**
 * #379 (#376 Q2): Onboarding's header Sign out, as `OnboardingSignOut` is for Clerk. Increment 5 passes it to the
 * workspace step's `signOut`; the step itself never imports the client.
 */
export function BetterAuthSignOut() {
  return <SignOutLink onSignOut={signOutToSignIn} />
}
