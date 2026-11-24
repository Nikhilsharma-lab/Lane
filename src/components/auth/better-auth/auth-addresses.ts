import { HOME, RETURN_PARAM, SIGN_IN_URL, SIGN_UP_URL, safeReturnAddress } from "@/lib/auth-return-address"
import type { SignInStart } from "./sign-in-flow"

/**
 * #378: the sign-in or sign-up page with the typed email to start from and a return address other than `HOME`. The
 * one builder of these addresses: the forms' links, Google's error address and the invitation page all use it.
 * `authPageQuery` reads them back.
 */
function address(page: string, email: string | undefined, returnTo: string | undefined, start?: SignInStart) {
  const query = new URLSearchParams()
  if (email?.trim()) query.set(EMAIL_PARAM, email.trim())
  const destination = safeReturnAddress(returnTo)
  if (destination !== HOME) query.set(RETURN_PARAM, destination)
  if (start && start !== "password") query.set(START_PARAM, start)
  const search = query.toString()
  return search ? `${page}?${search}` : page
}

/** The signed-out pages' query name for the email to start with. */
const EMAIL_PARAM = "email"
/** The sign-in page's query name for the screen it opens at, when that isn't email and password. */
export const START_PARAM = "start"
/** The query name Google's redirect back puts its code in. */
const ERROR_PARAM = "error"

export const signInPage = (email?: string, returnTo?: string, start?: SignInStart) => address(SIGN_IN_URL, email, returnTo, start)
export const signUpPage = (email?: string, returnTo?: string) => address(SIGN_UP_URL, email, returnTo)

export type AuthPageQuery = Record<string, string | string[] | undefined>

/** #388: what a signed-out page's query says, as the forms' props. A repeated name counts once, by its first value. */
export function authPageQuery(query: AuthPageQuery) {
  const read = (name: string) => [query[name]].flat()[0] || undefined
  const start: SignInStart = read(START_PARAM) === "code-request" ? "code-request" : "password"
  return { email: read(EMAIL_PARAM), returnTo: read(RETURN_PARAM), errorCode: read(ERROR_PARAM), start }
}
