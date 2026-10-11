import { requireActiveMember } from "@/lib/auth-guard";
import { loadOlderDoneRequests } from "@/lib/data/requests";
import { authorizeReadRoute, json } from "../../_lib/read-route";

/**
 * GET /api/requests/done?org=&before= (plan item 1.7): "Show older Done". The
 * list page loads the latest Done Requests; this pages further back from the
 * oldest one shown. A guest still reads only Requests they created (the loader
 * carries the guard). Dates serialise as ISO strings.
 */
export async function GET(request: Request) {
  const access = await authorizeReadRoute(request, requireActiveMember);
  if (!access.ok) return access.response;

  try {
    return json(await loadOlderDoneRequests(access.auth, access.params.get("before") ?? ""));
  } catch (error) {
    console.error("[api/requests/done] list failed", { kind: error instanceof Error ? error.name : "UnknownError" });
    return json({ error: "Older Done Requests could not be loaded. Try again." }, { status: 500 });
  }
}
