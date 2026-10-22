import { requireActiveMember } from "@/lib/auth-guard";
import { FINISHED_VIEWS, loadOlderDoneRequests, type FinishedView } from "@/lib/data/requests";
import { authorizeReadRoute, json } from "../../_lib/read-route";

/**
 * GET /api/requests/done?org=&before=&status= (plan item 1.7; #133): older
 * finished Requests. The list page loads the latest finished ones (Done,
 * Measuring, Closed); this pages further back from a cursor, in one status
 * view (`status`: done, measuring, closed or due; absent for all of them),
 * filtered in the database by the journey module's conditions. A guest still reads only Requests they created (the loader
 * carries the guard). Dates serialise as ISO strings.
 */
export async function GET(request: Request) {
  const access = await authorizeReadRoute(request, requireActiveMember);
  if (!access.ok) return access.response;

  try {
    const status = access.params.get("status") ?? "all";
    const view: FinishedView = FINISHED_VIEWS.find(item => item === status) ?? "all";
    return json(await loadOlderDoneRequests(access.auth, access.params.get("before") ?? "", view));
  } catch (error) {
    console.error("[api/requests/done] list failed", { kind: error instanceof Error ? error.name : "UnknownError" });
    return json({ error: "Older Requests could not be loaded. Try again." }, { status: 500 });
  }
}
