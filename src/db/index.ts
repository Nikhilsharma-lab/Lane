import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { assertSafeDatabaseUrl } from "./hosted-database-guard";
import { databaseTlsOptions } from "./tls-options";
import { queryCounter } from "./query-counter";
import * as schema from "./schema";

type DbClient = ReturnType<typeof drizzle<typeof schema>>;

const globalForDb = global as unknown as {
  _sql?: ReturnType<typeof postgres>;
  _db?: DbClient;
};

function getDb(): DbClient {
  if (!globalForDb._db) {
    if (!process.env.DATABASE_URL) {
      throw new Error(
        "[db] DATABASE_URL is not set. Add it to .env.local (local) or Vercel env vars (production)."
      );
    }

    const url = new URL(process.env.DATABASE_URL);
    assertSafeDatabaseUrl(process.env.DATABASE_URL);

    // Supabase's transaction pooler (port 6543) needs prepare: false. A function
    // instance next to the database reconnects in milliseconds, so the pool stays
    // small and idle sockets close after 20 s rather than risking a dead one.
    globalForDb._sql = postgres(process.env.DATABASE_URL, {
      prepare: false,
      max: 8,
      idle_timeout: 20,
      connect_timeout: 10,
      ssl: databaseTlsOptions(url, process.env.DATABASE_SSL_CA),
    });

    // Postgres.js manages this pool itself. Vercel's attachDatabasePool
    // supports pg-style pools, not this driver's client, and throws for it.

    globalForDb._db = drizzle(globalForDb._sql, {
      schema,
      logger: { logQuery: () => queryCounter.record() },
    });
  }

  return globalForDb._db;
}

/** Lazy database client — connection opens on first query, not on import. */
export const db = new Proxy({} as DbClient, {
  get(_target, prop) {
    return Reflect.get(getDb(), prop);
  },
});

export { queryCounter } from "./query-counter";
export * from "./schema";
