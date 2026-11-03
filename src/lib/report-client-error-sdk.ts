/**
 * The browser half of src/lib/report-client-error.ts, fetched only after an error boundary has caught something:
 * the Sentry browser SDK (~30 KB gzip) and the code that initialises it once and sends. Kept out of the boundaries'
 * own files, which every route loads first (Build 4 size cut).
 */

import * as Sentry from "@sentry/nextjs";
import { DATA_COLLECTION } from "@/lib/error-reporting";
import type { ClientErrorContext } from "@/lib/report-client-error";

export async function sendClientError(dsn: string, error: unknown, context: ClientErrorContext): Promise<void> {
  if (!Sentry.getClient()) {
    Sentry.init({
      dsn,
      environment: process.env.NEXT_PUBLIC_VERCEL_ENV || process.env.NODE_ENV || "development",
      release: process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA || undefined,
      tracesSampleRate: 0,
      dataCollection: DATA_COLLECTION,
    });
  }
  Sentry.captureException(error, {
    tags: { boundary: context.boundary },
    extra: context.digest ? { digest: context.digest } : undefined,
  });
  await Sentry.flush(2000);
}
