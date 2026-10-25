import { and, eq, sql, type AnyColumn, type SQL } from "drizzle-orm";
import { requests } from "@/db";
import type { MemberAuth } from "./auth-guard";

export { canChange, canSee } from "./request-access-rules";

/**
 * Who can see a Request and who can change it. Every query, statement and
 * permission flag reads these, so the rules live in one place:
 *
 * - **See:** everyone in the Request's workspace, except a guest, who sees
 *   only the Requests they created. Anything else reads as missing.
 * - **Change:** its creator (a guest included) or a workspace admin, never a
 *   Viewer (#210). Once a Member takes a Guest submission on (#212), that Member
 *   changes it in the Guest's place. Which status allows which change stays
 *   with each change.
 *
 * Each rule comes as a Drizzle condition (`seeable`, `changeable`), a raw SQL
 * fragment for hand-written statements (`seeableSql`), and a check on a row
 * already loaded (`canSee`, `canChange`), all built from the same facts.
 */

type Access = Pick<MemberAuth, "orgId" | "userId" | "role">;
/** The `requests` table or an alias of it. */
type RequestColumns = { orgId: AnyColumn; createdBy: AnyColumn; takenOnBy: AnyColumn };

/** Requests `auth` can see, as a condition on `table` (the requests table or an alias). */
export function seeable(auth: Access, table: RequestColumns = requests): SQL {
  return and(eq(table.orgId, auth.orgId), auth.role === "guest" ? eq(table.createdBy, auth.userId) : undefined)!;
}

/** `seeable` for a hand-written statement, as `and …` clauses on `table`'s columns. */
export function seeableSql(auth: Access, table: RequestColumns = requests): SQL {
  return auth.role === "guest"
    ? sql`and ${table.orgId} = ${auth.orgId} and ${table.createdBy} = ${auth.userId}`
    : sql`and ${table.orgId} = ${auth.orgId}`;
}

/** Requests `auth` can change, as a condition on `table`. */
export function changeable(auth: Access, table: RequestColumns = requests): SQL {
  if (auth.role === "viewer") return sql`false`;
  return and(eq(table.orgId, auth.orgId), auth.role === "admin" ? undefined : sql`coalesce(${table.takenOnBy}, ${table.createdBy}) = ${auth.userId}`)!;
}

/** `changeable` as a boolean column, for a list or detail query to offer edits. */
export function changeableColumn(auth: Access, table: RequestColumns = requests): SQL<boolean> {
  if (auth.role === "viewer") return sql<boolean>`false`;
  return sql<boolean>`(${auth.role === "admin"} or coalesce(${table.takenOnBy}, ${table.createdBy}) = ${auth.userId})`;
}
