/** Lane's sign-in and sign-up pages. */
export const SIGN_IN_URL = "/login"
export const SIGN_UP_URL = "/signup"

/**
 * Lane's home, which opens the workspace you used last (#333 Q12), and where Lane goes after sign-in when it was
 * given no return address, or one it won't follow.
 */
export const HOME = "/"
/** The sign-in and sign-up pages' query name for the return address. */
export const RETURN_PARAM = "redirect_url"
/** The header on which the proxy hands the server the request's own path and query (#387). */
export const RETURN_ADDRESS_HEADER = "x-lane-return-address"

/**
 * #377 (#376 story 14): a return address Lane follows after sign-in, or `HOME`. Only a path within Lane is kept: one
 * that starts with a single `/`, not `//` or `/\` (which a browser reads as another site). Control characters are
 * refused too, because a browser drops a tab or line break from an address and `/\t/x` would become `//x`.
 */
export function safeReturnAddress(value: string | null | undefined): string {
  if (!value || !value.startsWith("/") || value[1] === "/" || value[1] === "\\") return HOME
  return /[\u0000-\u001f\u007f]/.test(value) ? HOME : value
}

/** The sign-in page, with a return address Lane follows; home needs none. */
export function signInReturningTo(address: string | null | undefined): string {
  const destination = safeReturnAddress(address)
  return destination === HOME ? SIGN_IN_URL : `${SIGN_IN_URL}?${new URLSearchParams({ [RETURN_PARAM]: destination })}`
}
