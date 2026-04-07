// app/api/alerts/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { db } from "@/db";
import { profiles, proactiveAlerts } from "@/db/schema";
import { eq, and, not, lt } from "drizzle-orm";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [profile] = await db
    .select()
    .from(profiles)
    .where(eq(profiles.id, user.id));
  if (!profile) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const alerts = await db
    .select()
    .from(proactiveAlerts)
    .where(
      and(
        eq(proactiveAlerts.recipientId, user.id),
        eq(proactiveAlerts.dismissed, false),
        not(lt(proactiveAlerts.expiresAt, new Date()))
      )
    )
    .orderBy(proactiveAlerts.generatedAt);

  // Sort by urgency: high → medium → low, then newest first within each urgency
  const urgencyOrder: Record<string, number> = { high: 0, medium: 1, low: 2 };
  alerts.sort((a, b) => {
    const urgencyDiff = urgencyOrder[a.urgency] - urgencyOrder[b.urgency];
    if (urgencyDiff !== 0) return urgencyDiff;
    return new Date(b.generatedAt).getTime() - new Date(a.generatedAt).getTime();
  });

  return NextResponse.json({
    alerts: alerts.map((a) => ({
      id: a.id,
      type: a.type,
      urgency: a.urgency,
      title: a.title,
      body: a.body,
      ctaLabel: a.ctaLabel,
      ctaUrl: a.ctaUrl,
      generatedAt: a.generatedAt,
    })),
    unreadCount: alerts.length,
  });
}
