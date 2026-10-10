import type { NextConfig } from "next";
import dotenv from "dotenv";

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
  },
  // Baseline security headers on every route; CSP stays Report-Only until
  // staging and production report nothing (src/lib/security-headers.ts).
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: securityHeaders({
          development: process.env.NODE_ENV !== "production",
          supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
        }),
      },
    ];
  },
};

export default nextConfig;
