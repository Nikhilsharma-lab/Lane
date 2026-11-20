// PROTOTYPE (#344). Lane's guard shape (#333 Q5, AGENTS.md): identity, workspace
// and role come only from the session cookie and the member row, once per request.
import { cache } from "react";
import { headers } from "next/headers";
import { auth } from "./auth";
import { sql, queries } from "./db";

export type MemberAuth = { userId: string; orgId: string; role: "admin" | "member" | "guest" | "viewer" };
const ROLES = new Set(["admin", "member", "guest", "viewer"]);

export const currentSession = cache(async () => auth.api.getSession({ headers: await headers() }));

export const guardActiveMember = cache(async (orgId: string): Promise<MemberAuth | null> => {
  const session = await currentSession();
  if (!session) return null;
  const [row] = await sql`select role from member where user_id = ${session.user.id} and organization_id = ${orgId}`;
  queries.count++; // raw postgres-js query, not seen by Drizzle's logger
  return row && ROLES.has(row.role) ? { userId: session.user.id, orgId, role: row.role } : null;
});
