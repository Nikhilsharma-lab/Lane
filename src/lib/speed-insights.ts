/**
 * Speed Insights helpers (decision 8.13, leftover plan L3).
 */

import type { BeforeSendMiddleware } from "@vercel/speed-insights";

const PRODUCTION_ORIGIN = "https://app.uselane.app";

/**
 * Reports only from the production deployment at app.uselane.app. Staging is its own Vercel project whose
 * deployments are also VERCEL_ENV=production, and Speed Insights is enabled per project, so the app URL
 * tells the two apart; previews, local builds and tests have neither.
 */
export function reportsSpeedInsights(env: { VERCEL_ENV?: string; NEXT_PUBLIC_APP_URL?: string }): boolean {
  if (env.VERCEL_ENV !== "production" || !env.NEXT_PUBLIC_APP_URL) return false;
  return URL.canParse(env.NEXT_PUBLIC_APP_URL) && new URL(env.NEXT_PUBLIC_APP_URL).origin === PRODUCTION_ORIGIN;
}

/**
 * Vercel stores each data point's URL beside its route. Lane URLs can carry an invitation ticket, a reset
 * token or a list filter in the query string, so the query and fragment are dropped before the event leaves
 * the browser. The path and route stay: they are what the dashboard groups by.
 */
export const withoutQueryOrHash: BeforeSendMiddleware = (event) => {
  try {
    const url = new URL(event.url);
    url.search = "";
    url.hash = "";
    return { ...event, url: url.href };
  } catch {
    // Not an absolute URL: keep only what precedes any query or fragment.
    return { ...event, url: event.url.split(/[?#]/, 1)[0] };
  }
};
