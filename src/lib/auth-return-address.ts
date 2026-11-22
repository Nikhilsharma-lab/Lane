import { SIGN_IN_URL } from "./session-task-urls"

/** Where Lane goes after sign-in when it was given no return address, or one it won't follow. */
const HOME = "/"
/** The sign-in page's query name for the return address, as Clerk's sign-in uses today. */
const RETURN_PARAM = "redirect_url"

/**
 * #377 (#376 story 14): a return address Lane follows after sign-in, or `/`. Only a path within Lane is kept: one
 * that starts with a single `/`, not `//` or `/\` (which a browser reads as another site). Control characters are
 * refused too, because a browser drops a tab or line break from an address and `/\t/x` would become `//x`.
 */
export function safeReturnAddress(value: string | null | undefined): string {
  if (!value || !value.startsWith("/") || value[1] === "/" || value[1] === "\\") return HOME
  // eslint-disable-next-line no-control-regex
  return /[\u0000-\u001f\u007f]/.test(value) ? HOME : value
}

/** The sign-in page, carrying a return address other than `/`. Google's error address points back here. */
export function signInAddress(returnTo: string | null | undefined): string {
  const address = safeReturnAddress(returnTo)
  return address === HOME ? SIGN_IN_URL : `${SIGN_IN_URL}?${new URLSearchParams({ [RETURN_PARAM]: address })}`
}
