import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { db } from "@/db";
import { requests, comments, profiles } from "@/db/schema";
import { and, eq } from "drizzle-orm";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: requestId } = await params;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const [profile] = await db.select().from(profiles).where(eq(profiles.id, user.id));
  if (!profile) return NextResponse.json({ error: "Profile not found" }, { status: 404 });
  if (profile.role !== "lead" && profile.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const [request] = await db.select().from(requests).where(
    and(eq(requests.id, requestId), eq(requests.orgId, profile.orgId))
  );
  if (!request) return NextResponse.json({ error: "Request not found" }, { status: 404 });

  try {
    await db.insert(comments).values({
      requestId,
      authorId: null,
      body: `🔔 Nudge sent by ${profile.fullName} — this request needs attention`,
      isSystem: true,
    });

    await db.update(requests).set({ updatedAt: new Date() }).where(eq(requests.id, requestId));
  } catch (err) {
    console.error("[nudge] DB error:", err);
    return NextResponse.json({ error: "Database error" }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
