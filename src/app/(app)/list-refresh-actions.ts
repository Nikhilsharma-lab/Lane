"use server";

import { refresh } from "next/cache";
import { guardActiveMember } from "@/lib/auth-guard";

/**
 * Follow-up to Build 5 of #256 (decision 4a, 2026-11-12): coming back to a hidden tab reads the list's fresh rows
 * (list-motion.ts). The Server Action `refresh()` sends the page's fresh rows back in this one response and, unlike
 * router.refresh(), leaves the pages the rows' links have already read ahead in place, so none of them is read again.
 * It changes nothing; someone outside the workspace gets the refusal and no fresh rows.
 */
export async function refreshRequestList(context: { orgId: string }) {
  const auth = await guardActiveMember(context.orgId, "Not found");
  if ("error" in auth) return auth;
  refresh();
  return { success: true };
}
