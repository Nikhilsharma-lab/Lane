/**
 * Browser-side error reporting for the error boundaries.
 *
 * The Sentry browser SDK is ~30 KB gzip, far over Lane's 2 KB per-route growth
 * budget (scripts/bundle-baseline.mjs), so it is never on the first-load path.
 * The boundaries call this after an error has already happened; only then is
 * report-client-error-sdk.ts fetched, with the SDK, as a separate chunk, which
 * initialises the SDK once and sends. This file stays this small because every
 * boundary, and so every route's first load, carries it.
 *
 * Nothing in here may throw: a failed report must not take the fallback UI
 * down with it.
 */

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

export type ClientErrorContext = {
  /** Which boundary caught it: "root-layout" or "workspace". */
  boundary: string;
  /** Next's error digest, when the throw started on the server. */
  digest?: string;
};

export async function reportClientError(error: unknown, context: ClientErrorContext): Promise<void> {
  if (!dsn) return;
  try {
    const { sendClientError } = await import("./report-client-error-sdk");
    await sendClientError(dsn, error, context);
  } catch {
    // Reporting is best-effort.
  }
}
