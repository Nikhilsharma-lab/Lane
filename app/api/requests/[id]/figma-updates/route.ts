import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { db } from "@/db";
import { requests, profiles, figmaUpdates } from "@/db/schema";
import { eq, desc } from "drizzle-orm";

// GET /api/requests/[id]/figma-updates — fetch all Figma updates for a request
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: requestId } = await params;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const [profile] = await db.select().from(profiles).where(eq(profiles.id, user.id));
  if (!profile) return NextResponse.json({ error: "Profile not found" }, { status: 404 });

  const [request] = await db.select().from(requests).where(eq(requests.id, requestId));
  if (!request || request.orgId !== profile.orgId) {
    return NextResponse.json({ error: "Request not found" }, { status: 404 });
  }

  const updates = await db
    .select()
    .from(figmaUpdates)
    .where(eq(figmaUpdates.requestId, requestId))
    .orderBy(desc(figmaUpdates.updatedAt));

  return NextResponse.json({ updates });
}
