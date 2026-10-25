"use server";

import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, profiles } from "@/db";
import { refusal, requireOwnerOrAdmin } from "@/lib/auth-guard";
import { startCheckout } from "@/lib/billing";
import { NOT_CHARGING, PAYING_UNAVAILABLE, paidSeats } from "@/lib/billing-plan-rules";
import { appOrigin, billingEnforced } from "@/lib/feature-switches";
import { paymentProvider } from "@/lib/payment-provider";
import { workspaceRoster } from "@/lib/workspace-roster";

/**
 * #214 Settings → Billing (Admins only): pay for Lane. This opens a checkout on the payment provider's hosted page
 * for the workspace's paid seats and returns the page; the provider tells Lane once it is paid
 * (`POST /api/billing/webhook`). The workspace comes from the page; the person and role only from the session.
 * Nothing is offered while billing isn't enforced or there is no payment provider.
 */

const checkoutSchema = z.object({ period: z.enum(["yearly", "monthly"]) });

export async function startPlanCheckout(data: { period: "yearly" | "monthly" }, context: { orgId: string }) {
  const parsed = checkoutSchema.safeParse(data);
  if (!parsed.success) return { error: "Choose yearly or monthly billing." };
  const auth = await requireOwnerOrAdmin(context.orgId);
  if (!auth) return { error: await refusal("Only Admins can pay for Lane in this workspace.") };
  if (!billingEnforced()) return { error: NOT_CHARGING };
  const provider = paymentProvider();
  if (!provider) return { error: PAYING_UNAVAILABLE };

  let seats: number;
  try {
    seats = paidSeats((await workspaceRoster(auth.orgId)).length);
  } catch {
    return { error: "Couldn’t count this workspace’s seats. Try again." };
  }
  const [profile] = await db.select({ email: profiles.email }).from(profiles).where(eq(profiles.id, auth.userId));
  const started = await startCheckout({ orgId: auth.orgId }, { period: parsed.data.period, seats, email: profile?.email ?? null, origin: appOrigin() }, provider);
  return started.ok ? { ok: true as const, url: started.url } : { error: started.error };
}
