import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

// Singleton prevents connection exhaustion across Next.js HMR cycles (dev)
// and across serverless invocations that share a module cache (Vercel).
// max:1 keeps us under Supabase session-pooler limits.
const g = global as unknown as { _db?: ReturnType<typeof drizzle<typeof schema>> };

if (!g._db) {
  const client = postgres(process.env.DATABASE_URL!, { prepare: false, max: 1 });
  g._db = drizzle(client, { schema });
}

export const db = g._db;
export * from "./schema";
