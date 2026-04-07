// app/api/alerts/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { db } from "@/db";
import { proactiveAlerts } from "@/db/schema";
import { eq, and, gte } from "drizzle-orm";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const alerts = await db
      .select()
      .from(proactiveAlerts)
      .where(
        and(
          eq(proactiveAlerts.recipientId, user.id),
          eq(proactiveAlerts.dismissed, false),
          gte(proactiveAlerts.expiresAt, new Date())
        )
      );

    // Sort by urgency: high → medium → low, then newest first within each urgency
    const urgencyOrder: Record<string, number> = { high: 0, medium: 1, low: 2 };
    alerts.sort((a, b) => {
      const urgencyDiff = (urgencyOrder[a.urgency] ?? 99) - (urgencyOrder[b.urgency] ?? 99);
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
  } catch (err) {
    console.error("[alerts] DB error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
