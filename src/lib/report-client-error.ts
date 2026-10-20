/**
 * Browser-side error reporting for the root error boundaries.
 *
 * The Sentry browser SDK is ~30 KB gzip, far over Lane's 2 KB per-route growth
 * budget (scripts/bundle-baseline.mjs), so it is never on the first-load path.
 * The two boundaries call this after an error has already happened; only then
 * is the SDK fetched as a separate chunk, initialised once, and asked to send.
 *
 * Nothing in here may throw: a failed report must not take the fallback UI
 * down with it.
 */

import { DATA_COLLECTION } from "@/lib/error-reporting";

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

type Sdk = typeof import("@sentry/nextjs");

let sdk: Promise<Sdk> | undefined;

function loadSdk(): Promise<Sdk> {
  sdk ??= import("@sentry/nextjs").then((Sentry) => {
    if (!Sentry.getClient()) {
      Sentry.init({
        dsn,
        environment: process.env.NEXT_PUBLIC_VERCEL_ENV || process.env.NODE_ENV || "development",
        release: process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA || undefined,
        tracesSampleRate: 0,
        dataCollection: DATA_COLLECTION,
      });
    }
    return Sentry;
  });
  return sdk;
}

export type ClientErrorContext = {
  /** Which boundary caught it: "root-layout" or "workspace". */
  boundary: string;
  /** Next's error digest, when the throw started on the server. */
  digest?: string;
};

export async function reportClientError(error: unknown, context: ClientErrorContext): Promise<void> {
  if (!dsn) return;
  try {
    const Sentry = await loadSdk();
    Sentry.captureException(error, {
      tags: { boundary: context.boundary },
      extra: context.digest ? { digest: context.digest } : undefined,
    });
    await Sentry.flush(2000);
  } catch {
    // Reporting is best-effort.
  }
}
