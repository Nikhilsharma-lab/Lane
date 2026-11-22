import { safeReturnAddress } from "@/lib/auth-return-address"
import { SIGN_IN_URL, SIGN_UP_URL } from "@/lib/session-task-urls"

/**
 * #378: the sign-in or sign-up page with the typed email to start from and a return address other than `/`, as the
 * sign-in form's "Sign up instead" builds it (#377). Increment 5's routes read `email` and `redirect_url` into the
 * form's props.
 */
function address(page: string, email: string | undefined, returnTo: string | undefined) {
  const query = new URLSearchParams()
  if (email?.trim()) query.set("email", email.trim())
  const destination = safeReturnAddress(returnTo)
  if (destination !== "/") query.set("redirect_url", destination)
  const search = query.toString()
  return search ? `${page}?${search}` : page
}

export const signInPage = (email?: string, returnTo?: string) => address(SIGN_IN_URL, email, returnTo)
export const signUpPage = (email?: string, returnTo?: string) => address(SIGN_UP_URL, email, returnTo)
