import type { NextConfig } from "next";
import dotenv from "dotenv";

// Force-load .env.local with override so it wins over system env vars.
// Needed because Claude Desktop sets an empty ANTHROPIC_API_KEY as a
// system env var, and Next.js's built-in dotenv doesn't override existing
// system env vars (standard dotenv behavior).
dotenv.config({ path: ".env.local", override: true });

const nextConfig: NextConfig = {
  /* config options here */
};

export default nextConfig;
