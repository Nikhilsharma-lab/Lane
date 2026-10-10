import { requireActiveMember } from "@/lib/auth-guard";
import { loadNotifications } from "@/lib/data/notifications";
import { authorizeReadRoute, json } from "../_lib/read-route";

/** GET /api/notifications?org= (plan item 1.16): the bell's list. Dates serialise as ISO strings. */
export async function GET(request: Request) {
  const access = await authorizeReadRoute(request, requireActiveMember);
  if (!access.ok) return access.response;

  try {
    return json({ notifications: await loadNotifications(access.auth) });
  } catch (error) {
    console.error("[api/notifications] list failed", { kind: error instanceof Error ? error.name : "UnknownError" });
    return json({ error: "Notifications could not be loaded. Try again." }, { status: 500 });
  }
}
