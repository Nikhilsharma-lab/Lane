import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { db } from "@/db";
import { profiles, requests, comments, requestStages } from "@/db/schema";
import { eq, inArray } from "drizzle-orm";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const steps: Record<string, unknown> = {};

  try {
    // Step 1: Auth
    const supabase = await createClient();
    const { data: { user }, error: authErr } = await supabase.auth.getUser();
    steps.auth = user ? { id: user.id } : { error: authErr?.message ?? "no user" };
    if (!user) return NextResponse.json({ steps, error: "Not authenticated" });

    // Step 2: Profile
    try {
      const [profile] = await db.select().from(profiles).where(eq(profiles.id, user.id));
      steps.profile = profile ? { id: profile.id, role: profile.role, orgId: profile.orgId } : "NOT FOUND";
      if (!profile) return NextResponse.json({ steps, error: "No profile" });
    } catch (e: any) {
      steps.profile = { error: e.message, stack: e.stack?.slice(0, 300) };
      return NextResponse.json({ steps, error: "Profile query failed" });
    }

    // Step 3: Request
    try {
      const [request] = await db.select().from(requests).where(eq(requests.id, id));
      steps.request = request
        ? {
            id: request.id,
            title: request.title,
            status: request.status,
            stage: request.stage,
            requesterId: request.requesterId,
            orgId: request.orgId,
            createdAt: String(request.createdAt),
            updatedAt: String(request.updatedAt),
            createdAtType: typeof request.createdAt,
            updatedAtType: typeof request.updatedAt,
            createdAtIsDate: request.createdAt instanceof Date,
          }
        : "NOT FOUND";
      if (!request) return NextResponse.json({ steps, error: "Request not found" });

      // Step 4: Requester
      try {
        const [requester] = await db.select().from(profiles).where(eq(profiles.id, request.requesterId));
        steps.requester = requester ? { id: requester.id, name: requester.fullName } : "NOT FOUND";
      } catch (e: any) {
        steps.requester = { error: e.message };
      }

      // Step 5: Stage history
      try {
        const history = await db.select().from(requestStages).where(eq(requestStages.requestId, id)).orderBy(requestStages.completedAt);
        steps.stageHistory = {
          count: history.length,
          sample: history[0] ? {
            id: history[0].id,
            stage: history[0].stage,
            enteredAt: String(history[0].enteredAt),
            completedAt: String(history[0].completedAt),
            enteredAtType: typeof history[0].enteredAt,
            completedAtType: typeof history[0].completedAt,
          } : null,
        };
      } catch (e: any) {
        steps.stageHistory = { error: e.message };
      }

      // Step 6: Comments
      try {
        const comms = await db.select().from(comments).where(eq(comments.requestId, id)).orderBy(comments.createdAt);
        steps.comments = {
          count: comms.length,
          sample: comms[0] ? {
            id: comms[0].id,
            authorId: comms[0].authorId,
            isSystem: comms[0].isSystem,
            createdAt: String(comms[0].createdAt),
            createdAtType: typeof comms[0].createdAt,
            createdAtIsDate: comms[0].createdAt instanceof Date,
          } : null,
        };
      } catch (e: any) {
        steps.comments = { error: e.message };
      }

      // Step 7: JSON.stringify the full request
      try {
        const serialized = JSON.parse(JSON.stringify(request));
        steps.jsonRoundTrip = "OK";
        steps.serializedKeys = Object.keys(serialized);
      } catch (e: any) {
        steps.jsonRoundTrip = { error: e.message };
      }

    } catch (e: any) {
      steps.request = { error: e.message, stack: e.stack?.slice(0, 500) };
      return NextResponse.json({ steps, error: "Request query failed" });
    }

    return NextResponse.json({ steps, ok: true });
  } catch (e: any) {
    return NextResponse.json({ steps, error: e.message, stack: e.stack?.slice(0, 500) });
  }
}
