import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { db } from "@/db";
import { requests, profiles, figmaUpdates, comments } from "@/db/schema";
import { eq, and } from "drizzle-orm";

// POST /api/requests/[id]/figma-updates/[updateId]/review — dev marks update reviewed
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string; updateId: string }> }
) {
  const { id: requestId, updateId } = await params;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const [profile] = await db.select().from(profiles).where(eq(profiles.id, user.id));
  if (!profile) return NextResponse.json({ error: "Profile not found" }, { status: 404 });

  const [request] = await db.select().from(requests).where(eq(requests.id, requestId));
  if (!request || request.orgId !== profile.orgId) {
    return NextResponse.json({ error: "Request not found" }, { status: 404 });
  }

  const body = await req.json().catch(() => ({}));
  const notes = (body.notes as string | undefined) ?? null;

  const [update] = await db
    .select()
    .from(figmaUpdates)
    .where(and(eq(figmaUpdates.id, updateId), eq(figmaUpdates.requestId, requestId)));

  if (!update) return NextResponse.json({ error: "Update not found" }, { status: 404 });
  if (update.devReviewed) return NextResponse.json({ ok: true, alreadyReviewed: true });

  await db
    .update(figmaUpdates)
    .set({
      devReviewed: true,
      devReviewedById: user.id,
      devReviewNotes: notes,
    })
    .where(eq(figmaUpdates.id, updateId));

  await db.insert(comments).values({
    requestId,
    authorId: user.id,
    body: `✅ ${profile.fullName ?? "Dev"} reviewed Figma update — ${update.changeDescription ?? ""}${notes ? `: "${notes}"` : ""}`,
    isSystem: true,
  });

  return NextResponse.json({ ok: true });
}
