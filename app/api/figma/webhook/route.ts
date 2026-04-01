import { NextResponse } from "next/server";
import { db } from "@/db";
import { requests, figmaUpdates, comments } from "@/db/schema";
import { eq, like } from "drizzle-orm";
import {
  verifyFigmaSignature,
  extractFileIdFromUrl,
  buildChangeDescription,
  type FigmaWebhookPayload,
} from "@/lib/figma/webhook-handler";

// Figma requires a 200 response quickly — no auth middleware on this route
export async function POST(req: Request) {
  const rawBody = await req.text();

  // Verify signature
  const token = process.env.FIGMA_WEBHOOK_TOKEN;
  if (token) {
    const sig = req.headers.get("x-figma-signature-256");
    if (!verifyFigmaSignature(rawBody, sig, token)) {
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }
  }

  let payload: FigmaWebhookPayload;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // Only handle file update events
  if (
    payload.event_type !== "FILE_UPDATE" &&
    payload.event_type !== "FILE_VERSION_UPDATE"
  ) {
    return NextResponse.json({ ok: true, skipped: true });
  }

  const figmaFileId = payload.file_key;
  if (!figmaFileId) return NextResponse.json({ ok: true, skipped: true });

  // Find all requests whose figmaUrl contains this file ID
  // Pattern: figma.com/design/<fileId>/... or figma.com/file/<fileId>/...
  const matchingRequests = await db
    .select()
    .from(requests)
    .where(like(requests.figmaUrl, `%${figmaFileId}%`));

  if (!matchingRequests.length) {
    return NextResponse.json({ ok: true, matched: 0 });
  }

  const changeDescription = buildChangeDescription(payload);
  const figmaUserHandle = payload.triggered_by?.handle ?? null;
  const updatedAt = payload.timestamp ? new Date(payload.timestamp) : new Date();

  // Insert a figma_update record for each matched request
  for (const request of matchingRequests) {
    const isPostHandoff =
      request.phase === "dev" ||
      request.phase === "track" ||
      !!request.figmaLockedAt;

    const requestPhase =
      request.phase === "design" ? "design"
      : request.phase === "dev" ? "dev"
      : null;

    await db.insert(figmaUpdates).values({
      requestId: request.id,
      figmaFileId,
      figmaFileName: payload.file_name ?? null,
      figmaFileUrl: `https://www.figma.com/design/${figmaFileId}`,
      figmaVersionId: payload.version_id ?? null,
      updatedById: null,
      figmaUserHandle,
      updatedAt,
      changeDescription,
      requestPhase: requestPhase as "design" | "dev" | null,
      postHandoff: isPostHandoff,
      devReviewed: false,
    });

    // System comment
    const who = figmaUserHandle ? `${figmaUserHandle}` : "Someone";
    const postHandoffNote = isPostHandoff ? " ⚠️ post-handoff update — dev review required" : "";
    await db.insert(comments).values({
      requestId: request.id,
      authorId: null,
      body: `🎨 ${who} updated Figma — ${changeDescription}${postHandoffNote}`,
      isSystem: true,
    });
  }

  return NextResponse.json({ ok: true, matched: matchingRequests.length });
}
