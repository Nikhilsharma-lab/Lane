// app/api/alerts/[id]/dismiss/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { db } from "@/db";
import { proactiveAlerts } from "@/db/schema";
import { and, eq } from "drizzle-orm";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const result = await db
      .update(proactiveAlerts)
      .set({ dismissed: true, dismissedAt: new Date() })
      .where(
        and(
          eq(proactiveAlerts.id, id),
          eq(proactiveAlerts.recipientId, user.id) // can only dismiss own alerts
        )
      )
      .returning({ id: proactiveAlerts.id });

    if (result.length === 0) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[alerts/dismiss] DB error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
