// Emptying, for the fresh start and for a rollback (#410 "empty", "empty-bucket", "restore"; stories 32–35, 63).
// The tables: every base table in `public`, read from the catalog at that moment, truncated in one statement in one
// transaction, sequences restarted. No other schema is touched (Supabase's auth and storage, drizzle's migrations):
// without CASCADE, a table elsewhere that references public makes the TRUNCATE fail rather than reach it. A failure
// rolls the whole transaction back and empties nothing. The bucket: every object at any depth, removed in batches;
// the bucket itself and its settings are never touched.
import type { Bucket } from "./bucket.mts";
import { connect, publicTables, rowCounts, type Sql } from "./database.mts";
import type { DatabaseTarget } from "./environments.mts";

const quoted = (name: string) => `public."${name.replaceAll('"', '""')}"`;

/** Empties every table in public in one transaction. Gives back each table's rows before. Throws, emptying nothing, on any failure. */
export async function emptyTables(target: DatabaseTarget): Promise<Record<string, number>> {
  const sql = connect(target);
  try {
    return await sql.begin(async (transaction) => {
      const write = transaction as unknown as Sql;
      // The Clerk build may still be serving while this runs: wait a little for its locks, never for ever.
      await write`set local lock_timeout = '10s'`;
      await write`set local statement_timeout = '120s'`;
      const before = await rowCounts(write);
      const tables = await publicTables(write);
      if (tables.length) await write.unsafe(`truncate table ${tables.map(quoted).join(", ")} restart identity`);
      const left = Object.entries(await rowCounts(write)).filter(([, rows]) => rows > 0);
      if (left.length) throw new Error(`${left.map(([table, rows]) => `${table} still holds ${rows} rows`).join(", ")}.`);
      return before;
    });
  } catch (error) {
    throw new Error(`Emptying failed and was rolled back, so nothing was emptied. ${(error as Error).message}`);
  } finally {
    await sql.end();
  }
}

export const REMOVE_BATCH = 100;

export type BucketEmptying = Readonly<{ found: number; removed: number; left: number; failures: string[] }>;

/**
 * Removes every object in the bucket, a batch at a time. A batch that fails is reported and the rest go on, so a
 * rerun finishes what one run couldn't. `left` is what the bucket holds when it's done, listed again.
 */
export async function emptyBucket(bucket: Bucket): Promise<BucketEmptying> {
  const objects = await bucket.list();
  const failures: string[] = [];
  for (let start = 0; start < objects.length; start += REMOVE_BATCH) {
    const batch = objects.slice(start, start + REMOVE_BATCH).map((object) => object.path);
    try {
      await bucket.remove(batch);
    } catch (error) {
      failures.push(`A batch of ${batch.length} files wasn't all removed: ${(error as Error).message}`);
    }
  }
  const left = (await bucket.list()).length;
  return { found: objects.length, removed: Math.max(0, objects.length - left), left, failures };
}
