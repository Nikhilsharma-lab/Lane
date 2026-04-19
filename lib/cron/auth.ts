/**
 * Cron request authorization.
 *
 * Fails closed: if CRON_SECRET is not configured, no request is authorized.
 * This prevents a misconfigured deployment from silently exposing expensive,
 * org-wide AI jobs to unauthenticated callers.
 */
export function isCronRequestAuthorized(
  authHeader: string | null,
  cronSecret: string | undefined
): boolean {
  if (!cronSecret) return false;
  return authHeader === `Bearer ${cronSecret}`;
}
