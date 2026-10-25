import { createHash, timingSafeEqual } from "node:crypto";

import { cronSecret } from "@/lib/feature-switches";
import { runDailyDelivery } from "@/lib/inbox-delivery";

/**
 * #206: the one scheduled daily job (approved in spec #195's build plan). It sends Record the release and
 * Result due items, once each, through the delivery module. Vercel Cron calls it with
 * `Authorization: Bearer $CRON_SECRET`; while CRON_SECRET is unset it refuses every call. The `vercel.json`
 * cron entry is added only in the change that switches email on.
 */
export const maxDuration = 60;

const NO_STORE = { "Cache-Control": "private, no-store" };
const digest = (value: string) => createHash("sha256").update(value).digest();

export async function GET(request: Request) {
  const secret = cronSecret();
  if (!secret) return Response.json({ error: "The daily Inbox job is switched off." }, { status: 503, headers: NO_STORE });
  const given = request.headers.get("authorization") ?? "";
  if (!timingSafeEqual(digest(given), digest(`Bearer ${secret}`)))
    return Response.json({ error: "Unauthorized." }, { status: 401, headers: NO_STORE });
  const report = await runDailyDelivery();
  return Response.json(report, { headers: NO_STORE });
}
