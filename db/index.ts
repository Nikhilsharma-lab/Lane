import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

// Supabase session-pooler (port 5432) with prepare:false.
// max:10 allows concurrent serverless invocations without exhausting the pool.
// Singleton via global prevents connection leaks across Next.js HMR hot-reloads.
const g = global as unknown as { _db?: ReturnType<typeof drizzle<typeof schema>> };

if (!g._db) {
  const client = postgres(process.env.DATABASE_URL!, {
    prepare: false,
    max: 10,
    idle_timeout: 20,
    connect_timeout: 10,
  });
  g._db = drizzle(client, { schema });
}

export const db = g._db;
export * from "./schema";
