// PROTOTYPE (#344). Lane's client shape (src/db/index.ts): postgres-js with
// prepare: false, pointed at the local PgBouncer in transaction mode.
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

export const DATABASE_URL = process.env.PROTO_DATABASE_URL ?? `postgresql://${process.env.USER}@127.0.0.1:6544/prototype_wipe_me_ba_344`;

const g = globalThis as unknown as { _protoSql?: ReturnType<typeof postgres>; _protoQueries?: { count: number; log: string[] } };
// On globalThis so proxy.ts, pages and route handlers share one counter.
export const queries = (g._protoQueries ??= { count: 0, log: [] });
export const sql = (g._protoSql ??= postgres(DATABASE_URL, { prepare: false, max: 8, idle_timeout: 20, connect_timeout: 10 }));
export const db = drizzle(sql, {
  schema,
  logger: { logQuery: (q) => { queries.count++; if (process.env.PROTO_LOG_SQL) queries.log.push(q); } },
});
