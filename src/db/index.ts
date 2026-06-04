import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
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

    globalForDb._sql = postgres(process.env.DATABASE_URL, {
      prepare: false,
      max: 3,
      idle_timeout: 20,
      connect_timeout: 10,
      ssl: "require",
    });

    globalForDb._db = drizzle(globalForDb._sql, { schema });
  }

  return globalForDb._db;
}

/** Lazy database client — connection opens on first query, not on import. */
export const db = new Proxy({} as DbClient, {
  get(_target, prop) {
    return Reflect.get(getDb(), prop);
  },
});

export * from "./schema";
