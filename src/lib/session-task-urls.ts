/** Lane's sign-in and sign-up pages, given to ClerkProvider (src/app/layout.tsx) and clerkMiddleware (src/proxy.ts). */
export const SIGN_IN_URL = "/login";
export const SIGN_UP_URL = "/signup";

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
  "choose-organization": SIGN_IN_URL,
  "reset-password": "/reset-password",
} as const;

const isSessionTask = (key: string | undefined): key is keyof typeof SESSION_TASK_URLS =>
  key !== undefined && Object.hasOwn(SESSION_TASK_URLS, key);

// Clerk's default task addresses under the sign-in and sign-up pages. The bare `/tasks` is what the
// server sends; `/tasks/<key>` covers the rest. Both page paths are plain words, so need no escaping.
const TASK_ADDRESS = new RegExp(`^(?:${SIGN_IN_URL}|${SIGN_UP_URL})/tasks(?:/([^/]*))?/?$`);

/** Lane's page for a Clerk task address, with the query string (Clerk's `redirect_url`) kept; null for any other address. */
export function sessionTaskRedirect(url: URL): URL | null {
  const match = TASK_ADDRESS.exec(url.pathname);
  if (!match) return null;
  const target = new URL(url);
  // Any other task, or none named, resumes on the sign-in page, as the workspace step does.
  target.pathname = SESSION_TASK_URLS[isSessionTask(match[1]) ? match[1] : "choose-organization"];
  return target;
}
