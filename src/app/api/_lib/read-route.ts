import "server-only";

import { guardActiveMember, type MemberAuth } from "@/lib/auth-guard";
import { SESSION_CHANGED } from "@/lib/failure-messages";
import { readSession } from "@/lib/session";
import { WORKSPACE_CHANGED_CODE } from "./read-route-answers";

/**
 * Plan item 1.16 (decision 8.15): read-only GET route handlers. Next runs
 * server functions one at a time and cannot abort them, so search as you
 * type, the reviewer type-ahead and the notification list would queue in
 * front of a user's mutation. These routes run in parallel and the client
 * aborts a stale request with an AbortController.
 *
 * Identity comes from the session seam through the existing guards. The `org`
 * query parameter names the workspace the page was rendered for; a session
 * that no longer matches it is refused, exactly like the action's context
 * check. Every response is private and uncacheable.
 */
export const READ_ROUTE_HEADERS = { "Cache-Control": "private, no-store" } as const;

export function json(body: unknown, init: { status?: number } = {}) {
  return Response.json(body, { status: init.status ?? 200, headers: READ_ROUTE_HEADERS });
}

const SIGNED_OUT = "Sign in to continue.";

export type ReadRouteAuth = { ok: true; auth: MemberAuth; params: URLSearchParams } | { ok: false; response: Response };

export async function authorizeReadRoute(request: Request): Promise<ReadRouteAuth> {
  const params = new URL(request.url).searchParams;
  const orgId = params.get("org");
  const refuse = (error: string, status: number, code?: string) => ({ ok: false, response: json({ error, code }, { status }) }) as const;
  // The guard's one session read decides everything (#402); without a workspace there is none to ask it about.
  if (!orgId) return (await readSession()) ? refuse("A workspace is required.", 400) : refuse(SIGNED_OUT, 401);
  const member = await guardActiveMember(orgId, SESSION_CHANGED);
  if (!("error" in member)) return { ok: true, auth: member, params };
  return member.sessionExpired ? refuse(SIGNED_OUT, 401) : refuse(member.error, 403, WORKSPACE_CHANGED_CODE);
}
