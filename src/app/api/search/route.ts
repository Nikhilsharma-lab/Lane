import { requireActiveMember } from "@/lib/auth-guard";
import { loadWorkspaceSearch, workspaceSearchInputSchema } from "@/lib/data/search";
import { authorizeReadRoute, json } from "../_lib/read-route";

function page(value: string | null) {
  if (value === null || value === "") return 0;
  const number = Number(value);
  return Number.isInteger(number) ? number : -1;
}

/** GET /api/search?org=&q=&requestsPage=&projectsPage= (plan item 1.16). */
export async function GET(request: Request) {
  const access = await authorizeReadRoute(request, requireActiveMember);
  if (!access.ok) return access.response;
  const { auth, params } = access;

  const parsed = workspaceSearchInputSchema.safeParse({
    query: params.get("q") ?? "",
    requestsPage: page(params.get("requestsPage")),
    projectsPage: page(params.get("projectsPage")),
  });
  if (!parsed.success) {
    return json({ success: false, error: { code: "validation", message: "Use a search of 200 characters or fewer and a valid results page." } }, { status: 400 });
  }

  try {
    return json(await loadWorkspaceSearch(auth, parsed.data));
  } catch {
    // Database errors may include bound search text; do not log them.
    return json({ success: false, error: { code: "search_failed", message: "Search could not be completed. Try again." } }, { status: 500 });
  }
}
