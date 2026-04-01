import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { db } from "@/db";
import { requests, comments, profiles } from "@/db/schema";
import { eq } from "drizzle-orm";

const KANBAN_STATES = ["todo", "in_progress", "in_review", "qa", "done"] as const;
type KanbanState = (typeof KANBAN_STATES)[number];

// PATCH /api/requests/[id]/kanban — move request to a kanban state
export async function PATCH(
  req: Request,
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

  if (request.phase !== "dev") {
    return NextResponse.json({ error: "Request is not in the dev phase" }, { status: 422 });
  }

  const body = await req.json();
  const { state } = body as { state: string };

  if (!KANBAN_STATES.includes(state as KanbanState)) {
    return NextResponse.json({ error: "Invalid kanban state" }, { status: 400 });
  }

  const prevState = request.kanbanState ?? "todo";
  await db
    .update(requests)
    .set({ kanbanState: state as KanbanState, updatedAt: new Date() })
    .where(eq(requests.id, requestId));

  const stateLabel = (s: string) =>
    s === "in_progress" ? "In Progress" : s === "in_review" ? "In Review" : s.charAt(0).toUpperCase() + s.slice(1);

  await db.insert(comments).values({
    requestId,
    authorId: null,
    body: `⭢ Kanban moved: ${stateLabel(prevState)} → ${stateLabel(state)}`,
    isSystem: true,
  });

  return NextResponse.json({ success: true });
}
