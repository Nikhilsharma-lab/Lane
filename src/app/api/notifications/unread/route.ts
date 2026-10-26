import { requireActiveMember } from "@/lib/auth-guard";
import { countNeedsYou } from "@/lib/data/inbox";
import { countInboxUnread } from "@/lib/data/notifications";
import { authorizeReadRoute, json } from "../../_lib/read-route";

/**
 * GET /api/notifications/unread?org= (plan item 1.16; #205): the Inbox's counts. `count` is what the bell shows,
 * the Needs-you items; `unread` is the unread For-your-information items the Inbox page shows by its heading.
 * Reading them writes nothing.
 */
export async function GET(request: Request) {
  const access = await authorizeReadRoute(request, requireActiveMember);
  if (!access.ok) return access.response;

  try {
    const [count, unread] = await Promise.all([countNeedsYou(access.auth), countInboxUnread(access.auth)]);
    return json({ count, unread });
  } catch (error) {
    console.error("[api/notifications/unread] count failed", { kind: error instanceof Error ? error.name : "UnknownError" });
    return json({ error: "Your Inbox could not be loaded. Try again." }, { status: 500 });
  }
}
