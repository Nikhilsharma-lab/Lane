import postgres from "postgres";
import { assertE2ETarget } from "./safety";

/** The checked e2e database (assertE2ETarget), on one connection. Callers end it. */
export function e2eDatabase() {
  const { databaseUrl, ssl } = assertE2ETarget();
  return postgres(databaseUrl, {
    ssl,
    max: 1,
    idle_timeout: 5,
  });
}

/** Runs `run` on a connection of its own, and ends it. */
export async function withE2EDatabase<T>(run: (sql: postgres.Sql) => Promise<T>): Promise<T> {
  const sql = e2eDatabase();
  try {
    return await run(sql);
  } finally {
    await sql.end();
  }
}
