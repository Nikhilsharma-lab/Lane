import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { db } from "@/db";
import { requests, profiles, figmaUpdates } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import { sendFigmaDriftEmail, APP_URL } from "@/lib/email";
import { NewFigmaUpdate } from "@/db/schema/figma_updates";

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

// POST /api/requests/[id]/figma-updates — log a new Figma update for a request
export async function POST(
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

  const body = await req.json().catch(() => ({})) as Partial<NewFigmaUpdate>;
  const {
    figmaFileUrl,
    figmaFileId,
    figmaFileName,
    figmaVersionId,
    changeDescription,
    changeSummary,
    requestPhase,
    postHandoff = false,
  } = body;

  if (!figmaFileUrl) {
    return NextResponse.json({ error: "figmaFileUrl is required" }, { status: 400 });
  }

  const [inserted] = await db
    .insert(figmaUpdates)
    .values({
      requestId,
      figmaFileUrl,
      figmaFileId: figmaFileId ?? null,
      figmaFileName: figmaFileName ?? null,
      figmaVersionId: figmaVersionId ?? null,
      updatedById: profile.id,
      changeDescription: changeDescription ?? null,
      changeSummary: changeSummary ?? null,
      requestPhase: requestPhase ?? null,
      postHandoff,
    })
    .returning();

  // Fire-and-forget: notify the dev owner if this is a post-handoff update
  if (postHandoff && request.devOwnerId) {
    void (async () => {
      try {
        const [devOwner] = await db
          .select()
          .from(profiles)
          .where(eq(profiles.id, request.devOwnerId!));

        if (!devOwner?.email) {
          console.log("[figma-drift] Dev owner not found or has no email, skipping notification");
          return;
        }

        const designerName = profile.fullName || profile.email;
        const requestUrl = `${APP_URL}/dashboard/requests/${requestId}`;

        void sendFigmaDriftEmail({
          to: devOwner.email,
          requestTitle: request.title,
          requestUrl,
          designerName,
        });
      } catch (err) {
        console.error("[figma-drift] Failed to send drift email:", err);
      }
    })();
  }

  return NextResponse.json({ update: inserted }, { status: 201 });
}
