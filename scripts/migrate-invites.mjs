import postgres from "postgres";
import { readFileSync } from "fs";

// Load .env.local
const env = readFileSync(".env.local", "utf8");
for (const line of env.split("\n")) {
  const [key, ...rest] = line.split("=");
  if (key && rest.length) process.env[key.trim()] = rest.join("=").trim();
}

const sql = postgres(process.env.DATABASE_URL, { prepare: false });

try {
  await sql`
    CREATE TABLE IF NOT EXISTS "invites" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
      "org_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
      "email" text NOT NULL,
      "token" text NOT NULL UNIQUE,
      "role" text NOT NULL DEFAULT 'designer',
      "invited_by" uuid REFERENCES "profiles"("id"),
      "accepted_at" timestamp with time zone,
      "expires_at" timestamp with time zone NOT NULL,
      "created_at" timestamp with time zone NOT NULL DEFAULT now()
    )
  `;
  console.log("✓ invites table created");
} catch (err) {
  console.error("Error:", err.message);
} finally {
  await sql.end();
}
