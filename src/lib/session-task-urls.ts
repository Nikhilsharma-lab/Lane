/**
 * Where Lane resumes each Clerk session task. The browser gets this as ClerkProvider's `taskUrls`;
 * `sessionTaskRedirect` gives the server the same answer.
 *
 * D1 (#257): Clerk's server-side redirect for a pending session (`redirectToSignIn` from a page)
 * goes to `<sign-in URL>/tasks` and takes no `taskUrls`, in @clerk/nextjs 7.9.4 as in Clerk's
 * clerkMiddleware docs. Lane has no page there, so a reload, bookmark or Request link with the
 * workspace step pending ended on "Page not found". The proxy sends that address here instead.
 */
export const SESSION_TASK_URLS = {
  "choose-organization": "/login",
  "reset-password": "/reset-password",
} as const;

// Clerk's default task addresses under the sign-in and sign-up pages (src/proxy.ts passes these as
// signInUrl and signUpUrl). The bare `/tasks` is what the server sends; `/tasks/<key>` covers the rest.
const TASK_ADDRESS = /^\/(?:login|signup)\/tasks(?:\/([^/]*))?\/?$/;

/** Lane's page for a Clerk task address, with the query string (Clerk's `redirect_url`) kept; null for any other address. */
export function sessionTaskRedirect(url: URL): URL | null {
  const match = TASK_ADDRESS.exec(url.pathname);
  if (!match) return null;
  const key = match[1];
  const target = new URL(url);
  target.pathname = key === "reset-password" ? SESSION_TASK_URLS["reset-password"] : SESSION_TASK_URLS["choose-organization"];
  return target;
}
