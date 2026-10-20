import * as Sentry from "@sentry/nextjs";

import { errorReportingOptions, scrubEvent } from "@/lib/error-reporting";

/**
 * Next runs register() once per server start (plan 6.1, I4/I5).
 * It is server-only; nothing here reaches the client bundle.
 *
 * Error monitoring (launch plan decision 13) starts here for both the Node and
 * Edge runtimes. It is a no-op until NEXT_PUBLIC_SENTRY_DSN is set.
 */
export async function register() {
  Sentry.init({ ...errorReportingOptions(), beforeSend: scrubEvent });

  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { reportServerEnv } = await import("@/lib/env");
  // Throws on a production boot when a required name is missing. In
  // development it prints one warning and lets the server start.
  reportServerEnv();
}

// Next calls this for every uncaught error in a Server Component, Server Action
// or route handler, with the request and the router context attached.
export const onRequestError = Sentry.captureRequestError;
