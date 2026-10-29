import { requireActiveMember } from "@/lib/auth-guard";
import { loadRequestDetail } from "@/lib/data/requests";
import { authorizeReadRoute, json } from "../../_lib/read-route";

/**
 * GET /api/requests/[id]?org= (plan item 2.12): the Request peek on the list.
 * The same loader and guards as the Request page, so a guest reads only a
 * Request they created. A missing Request and one this person may not see
 * answer the same 404, as the page's "Request unavailable" does. Abortable, so
 * a held J on the list never queues reads in front of a mutation (decision
 * 8.15). Dates serialise as ISO strings.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const access = await authorizeReadRoute(request, requireActiveMember);
  if (!access.ok) return access.response;

  try {
    const detail = await loadRequestDetail(access.auth, (await params).id);
    if (!detail) return json({ error: "This Request can’t be opened." }, { status: 404 });
    return json(detail);
  } catch (error) {
    console.error("[api/requests/id] detail failed", { kind: error instanceof Error ? error.name : "UnknownError" });
    return json({ error: "This Request couldn't be loaded. Try again." }, { status: 500 });
  }
}
