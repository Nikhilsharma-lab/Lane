import { requireActiveMember } from "@/lib/auth-guard";
import { loadWorkspaceSearch, workspaceSearchInputSchema } from "@/lib/data/search";
import { authorizeReadRoute, json } from "../_lib/read-route";

function page(value: string | null) {
  if (value === null || value === "") return 0;
  const number = Number(value);
  return Number.isInteger(number) ? number : -1;
}

/** GET /api/search?org=&q=&requestsPage=&projectsPage=&statuses=&types=&sort=&createdSince=&createdBefore= (plan items 1.16 and 2.8). */
export async function GET(request: Request) {
  const access = await authorizeReadRoute(request, requireActiveMember);
  if (!access.ok) return access.response;
  const { auth, params } = access;

  const parsed = workspaceSearchInputSchema.safeParse({
    query: params.get("q") ?? "",
    requestsPage: page(params.get("requestsPage")),
    projectsPage: page(params.get("projectsPage")),
    statuses: params.has("statuses") ? params.get("statuses")!.split(",") : undefined,
    types: params.has("types") ? params.get("types")!.split(",") : undefined,
    sort: params.get("sort") ?? undefined,
    createdSince: params.get("createdSince") ?? undefined,
    createdBefore: params.get("createdBefore") ?? undefined,
  });
  if (!parsed.success) {
    return json({ success: false, error: { code: "validation", message: "Check your search, filters and date range, then try again." } }, { status: 400 });
  }

  try {
    return json(await loadWorkspaceSearch(auth, parsed.data));
  } catch {
    // Database errors may include bound search text; do not log them.
    return json({ success: false, error: { code: "search_failed", message: "Search couldn't be completed. Try again." } }, { status: 500 });
  }
}
