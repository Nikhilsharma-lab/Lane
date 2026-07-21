import type { NextConfig } from "next";
import dotenv from "dotenv";

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
};

export default nextConfig;
