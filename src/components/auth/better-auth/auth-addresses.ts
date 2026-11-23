import { HOME, RETURN_PARAM, safeReturnAddress } from "@/lib/auth-return-address"
import { SIGN_IN_URL, SIGN_UP_URL } from "@/lib/session-task-urls"
import type { SignInStart } from "./sign-in-flow"

/**
 * #378: the sign-in or sign-up page with the typed email to start from and a return address other than `HOME`. The
 * one builder of these addresses: the forms' links, Google's error address and the invitation page all use it.
 * Increment 5's routes read `email`, `redirect_url` and `start` into the form's props.
 */
function address(page: string, email: string | undefined, returnTo: string | undefined, start?: SignInStart) {
  const query = new URLSearchParams()
  if (email?.trim()) query.set("email", email.trim())
  const destination = safeReturnAddress(returnTo)
  if (destination !== HOME) query.set(RETURN_PARAM, destination)
  if (start && start !== "password") query.set(START_PARAM, start)
  const search = query.toString()
  return search ? `${page}?${search}` : page
}

/** The sign-in page's query name for the screen it opens at, when that isn't email and password. */
export const START_PARAM = "start"

export const signInPage = (email?: string, returnTo?: string, start?: SignInStart) => address(SIGN_IN_URL, email, returnTo, start)
export const signUpPage = (email?: string, returnTo?: string) => address(SIGN_UP_URL, email, returnTo)
