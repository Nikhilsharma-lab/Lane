import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { db } from "@/db";
import { comments } from "@/db/schema";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: requestId } = await params;

  if (!UUID_RE.test(requestId)) {
    return NextResponse.json({ error: "Invalid request ID" }, { status: 400 });
  }

  const { body, isDevQuestion } = await req.json();

  if (!body?.trim()) return NextResponse.json({ error: "Comment cannot be empty" });

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  await db.insert(comments).values({
    requestId,
    authorId: user.id,
    body: body.trim(),
    isSystem: false,
    isDevQuestion: Boolean(isDevQuestion),
  });

  return NextResponse.json({ success: true });
}
