// The kit's database connection: the Postgres client Lane already uses, with `prepare: false` (#410 story 51), TLS
// verified against Supabase's CA for a hosted target, and credentials passed as options rather than a URL.
import { readFileSync } from "node:fs";
import path from "node:path";
import postgres from "postgres";
import type { DatabaseTarget } from "./environments.mts";

export type Sql = ReturnType<typeof postgres>;

const ROOT = path.resolve(import.meta.dirname, "../..");

/**
 * Supabase's root CA, the one Lane's own client verifies with: DATABASE_SSL_CA in the checkout's .env.local. It isn't
 * secret; only that one name is read. Without it, TLS still verifies, against the system's CAs, and fails closed.
 */
export function supabaseCa(file = path.join(ROOT, ".env.local")): string | undefined {
  let text: string;
  try {
    text = readFileSync(file, "utf8");
  } catch {
    return undefined;
  }
  const match = /^DATABASE_SSL_CA=(?:"([^"]*)"|'([^']*)'|(.*))$/m.exec(text);
  return match ? (match[1] ?? match[2] ?? match[3]).replaceAll("\\n", "\n") : undefined;
}

/** As src/db/tls-options.ts: verified TLS, with Supabase's CA when the checkout has it, never a fallback to unverified. */
function tls(): { rejectUnauthorized: true; ca?: string } {
  const ca = supabaseCa()?.trim();
  return { rejectUnauthorized: true, ...(ca ? { ca } : {}) };
}

export function connect(target: DatabaseTarget): Sql {
  return postgres({
    host: target.host,
    port: target.port,
    user: target.user,
    password: target.password,
    database: target.database,
    ssl: target.local ? false : tls(),
    prepare: false,
    max: 1,
    connect_timeout: 20,
    onnotice: () => {},
    connection: { application_name: "lane-cutover-kit" },
  });
}

/** Runs `read` in one read-only transaction, so a read-only subcommand can't write even by mistake. */
export async function readOnly<T>(target: DatabaseTarget, read: (sql: Sql) => Promise<T>): Promise<T> {
  const sql = connect(target);
  try {
    return (await sql.begin("read only", (transaction) => read(transaction as unknown as Sql))) as T;
  } finally {
    await sql.end();
  }
}

/**
 * Every base table in `public` (plain and partitioned), read from pg_catalog now. The catalog, not
 * information_schema: information_schema leaves out a table the connected role has no privilege on, and emptying
 * must not leave one out quietly.
 */
export async function publicTables(sql: Sql): Promise<string[]> {
  const rows = await sql<{ name: string }[]>`
    select c.relname as name from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r', 'p') order by c.relname`;
  return rows.map((row) => row.name);
}

/** Every base table in `public`, read from the catalog now, with its row count. */
export async function rowCounts(sql: Sql): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};
  for (const table of await publicTables(sql)) {
    const [row] = await sql.unsafe(`select count(*)::bigint as rows from public."${table.replaceAll('"', '""')}"`);
    counts[table] = Number(row.rows);
  }
  return counts;
}
