import { requireActiveMember } from "@/lib/auth-guard";
import { loadInbox } from "@/lib/data/inbox";
import { authorizeReadRoute, json } from "../_lib/read-route";

/** GET /api/notifications?org= (plan item 1.16; #204, #205): the Inbox (Needs you and For your information), re-read when the page regains focus. Dates serialise as ISO strings. */
export async function GET(request: Request) {
  const access = await authorizeReadRoute(request, requireActiveMember);
  if (!access.ok) return access.response;

  try {
    return json(await loadInbox(access.auth));
  } catch (error) {
    console.error("[api/notifications] list failed", { kind: error instanceof Error ? error.name : "UnknownError" });
    return json({ error: "Your Inbox could not be loaded. Try again." }, { status: 500 });
  }
}
