/**
 * Error monitoring options (launch plan decision 13: error monitoring on a free
 * tier). Lane reports to GlitchTip, which speaks the Sentry protocol, through
 * `@sentry/nextjs`.
 *
 * Kept as pure functions so the choices are testable and read in one place:
 * - Off unless NEXT_PUBLIC_SENTRY_DSN is set. Local work stays silent.
 * - No tracing, no session replay. Errors only. GlitchTip's performance
 *   support is minimal anyway, and traces would count against the free quota.
 * - SDK v11 collects user info, cookies, request bodies, query params, AI
 *   prompt text, DB query data and local variables by default. All of that is
 *   off here ("support, not surveillance", AGENTS.md): a Request's text or a
 *   Clerk session must never ride along with a stack trace. The URL path, the
 *   method and a few harmless headers stay so an error is still locatable.
 * - `scrubEvent` is the belt to that braces: cookies, auth headers and any
 *   user block are dropped again right before an event leaves the server.
 *
 * The server is wired from src/instrumentation.ts. The browser SDK is NOT on
 * the first-load path (per-route 2 KB gzip budget, scripts/bundle-baseline.mjs):
 * the error boundaries import it on demand, see src/lib/report-client-error.ts.
 */

type Env = Record<string, string | undefined>;

/**
 * Sentry's `dataCollection` (v11 replaced `sendDefaultPii` with this). Shared
 * by the server init and the lazy browser init. Structurally typed against
 * the SDK where it is passed to `init`, so a renamed field fails typecheck.
 */
export type DataCollectionSettings = {
  userInfo: false;
  cookies: false;
  httpHeaders: { request: { allow: string[] }; response: false };
  /** Empty means no request or response bodies at all. */
  httpBodies: never[];
  urlQueryParams: false;
  genAI: { inputs: false; outputs: false };
  databaseQueryData: false;
  queues: false;
  stackFrameVariables: false;
};

export const DATA_COLLECTION: DataCollectionSettings = {
  userInfo: false,
  cookies: false,
  httpHeaders: { request: { allow: ["user-agent", "content-type", "accept"] }, response: false },
  httpBodies: [],
  urlQueryParams: false,
  genAI: { inputs: false, outputs: false },
  databaseQueryData: false,
  queues: false,
  stackFrameVariables: false,
};

export type ErrorReportingOptions = {
  dsn: string | undefined;
  enabled: boolean;
  environment: string;
  release: string | undefined;
  tracesSampleRate: 0;
  /** The machine's hostname is not needed to locate an error; Vercel's is noise and a laptop's is personal. */
  includeServerName: false;
  dataCollection: DataCollectionSettings;
};

export function errorReportingOptions(env: Env = process.env): ErrorReportingOptions {
  const dsn = env.NEXT_PUBLIC_SENTRY_DSN?.trim() || undefined;
  return {
    dsn,
    enabled: Boolean(dsn),
    // VERCEL_ENV is production | preview | development on Vercel; fall back to
    // NODE_ENV so a local `next start` is still labelled.
    environment: env.VERCEL_ENV || env.NODE_ENV || "development",
    release: env.VERCEL_GIT_COMMIT_SHA || undefined,
    tracesSampleRate: 0,
    includeServerName: false,
    dataCollection: DATA_COLLECTION,
  };
}

// Header names Sentry would otherwise forward verbatim.
const SENSITIVE_HEADERS = new Set(["authorization", "cookie", "set-cookie", "x-clerk-auth-token"]);

/** The shape of an event we scrub. Structural so it needs no SDK types. */
export type ScrubbableEvent = {
  message?: string;
  request?: {
    cookies?: unknown;
    headers?: Record<string, unknown>;
  };
  user?: unknown;
};

/**
 * `beforeSend` hook: drops cookies, auth headers and any user block. Returns
 * the same object, mutated, so the SDK's typing is satisfied.
 */
export function scrubEvent<T extends ScrubbableEvent>(event: T): T {
  if (event.request) {
    delete event.request.cookies;
    if (event.request.headers) {
      for (const name of Object.keys(event.request.headers)) {
        if (SENSITIVE_HEADERS.has(name.toLowerCase())) delete event.request.headers[name];
      }
    }
  }
  delete event.user;
  return event;
}
