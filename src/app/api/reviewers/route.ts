import { requireMemberOrAbove } from "@/lib/auth-guard";
import { loadDesignReviewers, REVIEWER_QUERY_MAX } from "@/lib/data/reviewers";
import { ReviewRuleError } from "@/lib/request-review";
import { authorizeReadRoute, json } from "../_lib/read-route";

/** GET /api/reviewers?org=&request=&q= (plan item 1.16). Guests cannot ask for a review, so the guard is requireMemberOrAbove. */
export async function GET(request: Request) {
  const access = await authorizeReadRoute(request, requireMemberOrAbove);
  if (!access.ok) return access.response;
  const { auth, params } = access;

  const requestId = params.get("request") ?? "";
  const query = (params.get("q") ?? "").trim();
  if (query.length > REVIEWER_QUERY_MAX) return json({ error: "Use a shorter name to find a reviewer" }, { status: 400 });

  try {
    return json({ members: await loadDesignReviewers(auth, requestId, query) });
  } catch (error) {
    if (error instanceof ReviewRuleError) return json({ error: error.message }, { status: error.message === "Request not found" ? 404 : 409 });
    console.error("[api/reviewers] list failed", { kind: error instanceof Error ? error.name : "UnknownError" });
    return json({ error: "Team members could not be loaded. Try again." }, { status: 500 });
  }
}
