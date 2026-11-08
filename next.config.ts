import type { NextConfig } from "next";
import dotenv from "dotenv";

import { MOTION_ALIAS } from "./src/components/motion/motion-alias";
import { securityHeaders } from "./src/lib/security-headers";

// Force-load Lane's selected local env file so it wins over system env vars.
// Needed because Claude Desktop sets an empty ANTHROPIC_API_KEY as a
// system env var, and Next.js's built-in dotenv doesn't override existing
// system env vars (standard dotenv behavior). Verification may opt into the
// staging file explicitly; normal development still uses .env.local.
dotenv.config({
  path: process.env.LANE_ENV_FILE ?? ".env.local",
  override: true,
});

const nextConfig: NextConfig = {
  allowedDevOrigins: ["127.0.0.1"],
  distDir: process.env.NEXT_DIST_DIR ?? ".next",
  experimental: {
    // Plan item 1.11: Request titles fully prefetch the detail route on
    // intent. Without this a full prefetch stays cached for the 5-minute
    // static default and could show a stale status; 30 s also lets Back and
    // a quick return to a Request reuse the page segment.
    staleTimes: { dynamic: 30, static: 30 },
    // Build 3 (phone first visit): Turbopack's documented chunker setting (turbopackChunking.md). At its 50 KB
    // default it split each page's first load into about 30 small files and copied the small modules the error and
    // not-found screens share (the empty state, the page strip, Link) into each screen's own file. Merging up to
    // 200 KB of source per chunk sends 10-14 KB (gzip) less on every signed-in page, in about 18 files. The code and
    // the order it runs in are unchanged; only how it is packed into files. Code fetched later (a popup's on first
    // open, another page's) grows about 5%, since merged files share less between groups.
    // Build 4 (size cut): 400 KB. At 200 KB the error and not-found screens' shared parts (the empty state, the
    // button, the page strip) were still copied into three or four of every page's files, and a few more lines in a
    // page could tip its own code into two files (the list did, after #270). At 400 KB every page's first load is
    // 0.9-3.6 KB (gzip) lighter in up to 3 fewer files; moving between pages and opening a popup fetch the same or less.
    // Build 5 (#275): merged files up to 250 KB (the default is 200 KB). The list's own code had reached the 200 KB
    // cap, so a few lines more cut it into two files and its first load grew 0.8 KB (gzip) for 0.3 KB of code. At
    // 250 KB every page's first load is 0.1-3.4 KB (gzip) lighter than at 200 KB, and none is heavier.
    turbopackChunking: { minChunkSize: 400_000, maxMergeChunkSize: 250_000 },
  },
  // #266: Motion's split needs `motion/react` resolved to framer-motion (src/components/motion/motion-alias.ts).
  turbopack: { resolveAlias: MOTION_ALIAS },
  // Baseline security headers on every route; CSP stays Report-Only until
  // staging and production report nothing (src/lib/security-headers.ts).
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: securityHeaders({
          development: process.env.NODE_ENV !== "production",
          supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
          errorReportingDsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
        }),
      },
    ];
  },
};

export default nextConfig;
