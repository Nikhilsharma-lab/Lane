// PROTOTYPE (#344).
import path from "node:path";
import type { NextConfig } from "next";
const config: NextConfig = { turbopack: { root: path.resolve(".") }, outputFileTracingRoot: path.resolve(".") };
export default config;
