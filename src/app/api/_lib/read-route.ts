import "server-only";

import { auth } from "@clerk/nextjs/server";
import type { MemberAuth } from "@/lib/auth-guard";

/**
 * Plan item 1.16 (decision 8.15): read-only GET route handlers. Next runs
 * server functions one at a time and cannot abort them, so search as you
 * type, the reviewer type-ahead and the notification list would queue in
 * front of a user's mutation. These routes run in parallel and the client
 * aborts a stale request with an AbortController.
 *
 * Identity comes from Clerk auth() through the existing guards. The `org`
 * query parameter names the workspace the page was rendered for; a session
 * that no longer matches it is refused, exactly like the action's context
 * check. Every response is private and uncacheable.
 */
export const READ_ROUTE_HEADERS = { "Cache-Control": "private, no-store" } as const;

export function json(body: unknown, init: { status?: number } = {}) {
  return Response.json(body, { status: init.status ?? 200, headers: READ_ROUTE_HEADERS });
}

export type ReadRouteAuth = { ok: true; auth: MemberAuth; params: URLSearchParams } | { ok: false; response: Response };

export async function authorizeReadRoute(
  request: Request,
  guard: (orgId: string) => Promise<MemberAuth | null>,
): Promise<ReadRouteAuth> {
  const params = new URL(request.url).searchParams;
  const orgId = params.get("org");
  const session = await auth();
  if (!session.userId) return { ok: false, response: json({ error: "Sign in to continue." }, { status: 401 }) };
  if (!orgId) return { ok: false, response: json({ error: "A workspace is required." }, { status: 400 }) };
  const member = await guard(orgId);
  if (!member) return { ok: false, response: json({ error: "Your workspace session changed. Refresh the page to continue." }, { status: 403 }) };
  return { ok: true, auth: member, params };
}
