import postgres from "postgres";
import { readFileSync } from "fs";

const env = readFileSync(".env.local", "utf8");
for (const line of env.split("\n")) {
  const [key, ...rest] = line.split("=");
  if (key && rest.length) process.env[key.trim()] = rest.join("=").trim();
}

const sql = postgres(process.env.DATABASE_URL, { prepare: false });

try {
  await sql`ALTER TABLE "requests" ADD COLUMN IF NOT EXISTS "figma_url" text`;
  console.log("✓ figma_url column added to requests");
} catch (err) {
  console.error("Error:", err.message);
} finally {
  await sql.end();
}
