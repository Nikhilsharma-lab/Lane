import "server-only"
import { sql } from "drizzle-orm"
import { db } from "@/db"

/** The end of this server's queue of changes. */
let last: Promise<unknown> = Promise.resolve()

/**
 * Runs a membership change that could take away a workspace's last Admin (leaving, removing, a role change) while no
 * other one runs for that workspace. Better Auth looks for another Admin and then writes, in separate statements, so
 * two changes side by side would each see the other's Admin.
 *
 * The lock is the transaction's, which Supabase's transaction pooler allows. The change itself runs on other
 * connections, so a turn holds one of this server's 8 while it needs another: this server takes one turn at a time,
 * whatever the workspace, and so never holds more than one that way. Servers wait for each other by the lock, 5
 * seconds at most; then the change fails and nothing is written.
 */
export function inMembershipTurn<T>(orgId: string, change: () => Promise<T>): Promise<T> {
  const turn = last.then(() =>
    db.transaction(async (tx) => {
      await tx.execute(sql`set local lock_timeout = '5s'`)
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`lane-membership:${orgId}`}))`)
      return change()
    }),
  )
  last = turn.catch(() => {})
  return turn
}
