import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const globalForDb = global as unknown as {
  _sql?: ReturnType<typeof postgres>;
  _db?: ReturnType<typeof drizzle<typeof schema>>;
};

if (!globalForDb._sql) {
  globalForDb._sql = postgres(process.env.DATABASE_URL!, {
    prepare: false,
    max: 3,
    idle_timeout: 20,
    connect_timeout: 10,
  });
}

if (!globalForDb._db) {
  globalForDb._db = drizzle(globalForDb._sql, { schema });
}

export const db = globalForDb._db;
export * from "./schema";
