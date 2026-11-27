/**
 * Better Auth's session cookie. It adds the __Secure- prefix when its URL is https (staging, production). Like its
 * getSessionCookie, Lane takes that cookie first and the plain one second; the signature is what's trusted, not the
 * name. On its own, so the proxy can look for the cookie without loading the database (#387).
 */
const SESSION_COOKIES = ["__Secure-better-auth.session_token", "better-auth.session_token"]

/** A request's cookies, as Next hands them to server code and the proxy. */
export type RequestCookies = { get(name: string): { value: string } | undefined }

/** The session cookie's value, unchecked, or undefined without one. */
export function sessionCookie(cookies: RequestCookies): string | undefined {
  return SESSION_COOKIES.map((name) => cookies.get(name)?.value).find(Boolean)
}
