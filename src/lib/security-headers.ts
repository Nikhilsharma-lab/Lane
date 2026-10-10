/**
 * Baseline security headers (plan 6.1, K1/K2).
 *
 * Imported by next.config.ts, so this file must stay free of app imports and
 * of the "@/" alias. The CSP ships in Report-Only until the browser console
 * on staging and production stays clean for a release.
 *
 * Hardening still to do (noted, not done here):
 * - script-src keeps 'unsafe-inline' because Next's hydration scripts are
 *   inline and this policy is nonce-free. Moving to nonces needs proxy.ts
 *   to mint one per request and pass it through the layout.
 * - report-uri / report-to are omitted. Add an endpoint before enforcing.
 * - Switch the header name to Content-Security-Policy once the reports are
 *   quiet.
 */

export type SecurityHeader = { key: string; value: string };

export type SecurityHeaderOptions = {
  /** Allows 'unsafe-eval' for Next's dev tooling. Never on in production. */
  development?: boolean;
  /**
   * The project's NEXT_PUBLIC_SUPABASE_URL. Added to connect-src and img-src
   * beside the *.supabase.co wildcard so a custom storage domain still works.
   */
  supabaseUrl?: string;
};

// Clerk: the dev instance lives on *.clerk.accounts.dev, production on
// clerk.uselane.app (plus accounts.uselane.app for hosted pages).
const CLERK_HOSTS = [
  "https://*.clerk.accounts.dev",
  "https://clerk.uselane.app",
  "https://*.uselane.app",
];
const CLERK_SOCKETS = ["wss://*.clerk.accounts.dev", "wss://clerk.uselane.app"];
// Clerk's bot protection widget.
const CLOUDFLARE_CHALLENGE = "https://challenges.cloudflare.com";
// Clerk profile images.
const CLERK_IMAGES = "https://img.clerk.com";
// Private attachment storage. Signed download URLs point here.
const SUPABASE_HOSTS = ["https://*.supabase.co"];
const SUPABASE_SOCKETS = ["wss://*.supabase.co"];
// Vercel toolbar on previews, and Speed Insights once decision 8.13 wires it.
const VERCEL_HOSTS = ["https://vercel.live", "https://va.vercel-scripts.com"];
const VERCEL_VITALS = "https://vitals.vercel-insights.com";
// next/font self-hosts Geist and Inter at build time, so these are only hit
// if something loads a Google font at runtime. Allowed per plan K2.
const GOOGLE_FONT_STYLES = "https://fonts.googleapis.com";
const GOOGLE_FONT_FILES = "https://fonts.gstatic.com";

function originOf(url: string | undefined): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:") return null;
    return parsed.origin;
  } catch {
    return null;
  }
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values));
}

/** Directive list for the Content-Security-Policy. Kept as data so it reads. */
export function contentSecurityPolicyDirectives(
  options: SecurityHeaderOptions = {},
): Array<[name: string, sources: string[]]> {
  const supabaseOrigin = originOf(options.supabaseUrl);
  const supabase = unique([...SUPABASE_HOSTS, ...(supabaseOrigin ? [supabaseOrigin] : [])]);
  const supabaseSockets = unique([
    ...SUPABASE_SOCKETS,
    ...(supabaseOrigin ? [supabaseOrigin.replace(/^https:/, "wss:")] : []),
  ]);

  return [
    ["default-src", ["'self'"]],
    [
      "script-src",
      [
        "'self'",
        "'unsafe-inline'",
        ...(options.development ? ["'unsafe-eval'"] : []),
        ...CLERK_HOSTS,
        CLOUDFLARE_CHALLENGE,
        ...VERCEL_HOSTS,
      ],
    ],
    ["style-src", ["'self'", "'unsafe-inline'", GOOGLE_FONT_STYLES]],
    ["font-src", ["'self'", "data:", GOOGLE_FONT_FILES]],
    ["img-src", ["'self'", "data:", "blob:", CLERK_IMAGES, ...CLERK_HOSTS, ...supabase, ...VERCEL_HOSTS]],
    [
      "connect-src",
      [
        "'self'",
        ...CLERK_HOSTS,
        ...CLERK_SOCKETS,
        CLOUDFLARE_CHALLENGE,
        ...supabase,
        ...supabaseSockets,
        ...VERCEL_HOSTS,
        VERCEL_VITALS,
      ],
    ],
    ["frame-src", [...CLERK_HOSTS, CLOUDFLARE_CHALLENGE, "https://vercel.live"]],
    ["worker-src", ["'self'", "blob:"]],
    ["manifest-src", ["'self'"]],
    ["object-src", ["'none'"]],
    ["base-uri", ["'self'"]],
    ["form-action", ["'self'", ...CLERK_HOSTS]],
    ["frame-ancestors", ["'none'"]],
  ];
}

export function buildContentSecurityPolicy(options: SecurityHeaderOptions = {}): string {
  return contentSecurityPolicyDirectives(options)
    .map(([name, sources]) => `${name} ${unique(sources).join(" ")}`)
    .join("; ");
}

/** The header set applied to every route by next.config.ts. */
export function securityHeaders(options: SecurityHeaderOptions = {}): SecurityHeader[] {
  return [
    { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    { key: "X-Frame-Options", value: "DENY" },
    { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
    { key: "Content-Security-Policy-Report-Only", value: buildContentSecurityPolicy(options) },
  ];
}
