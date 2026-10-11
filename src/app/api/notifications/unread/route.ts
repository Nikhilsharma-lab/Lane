import { requireActiveMember } from "@/lib/auth-guard";
import { loadUnreadCount } from "@/lib/data/notifications";
import { authorizeReadRoute, json } from "../../_lib/read-route";

/** GET /api/notifications/unread?org= (plan item 1.16): the badge count, read when the bell opens. */
export async function GET(request: Request) {
  const access = await authorizeReadRoute(request, requireActiveMember);
  if (!access.ok) return access.response;

  try {
    return json({ count: await loadUnreadCount(access.auth) });
  } catch (error) {
    console.error("[api/notifications/unread] count failed", { kind: error instanceof Error ? error.name : "UnknownError" });
    return json({ error: "Notifications could not be loaded. Try again." }, { status: 500 });
  }
}
