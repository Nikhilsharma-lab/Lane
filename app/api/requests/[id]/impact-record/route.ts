import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { db } from "@/db";
import { requests, profiles, impactRecords, comments } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { canRecordImpact } from "@/lib/request-permissions";

/** Extract the first number (with optional sign/decimal) from a free-text string. */
function extractNumber(text: string): number | null {
  const match = text.match(/([+-]?\d+(?:\.\d+)?)/);
  return match ? parseFloat(match[1]) : null;
}

/** variance% = ((actual - predicted) / |predicted|) * 100 */
function calcVariance(predictedText: string, actualText: string): number | null {
  const p = extractNumber(predictedText);
  const a = extractNumber(actualText);
  if (p === null || a === null || p === 0) return null;
  return ((a - p) / Math.abs(p)) * 100;
}

// GET /api/requests/[id]/impact-record — fetch the structured impact record
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

  // All org members can read impact records (CLAUDE.md visibility table: ✅ for every role)
  const [record] = await db
    .select()
    .from(impactRecords)
    .where(eq(impactRecords.requestId, requestId));

  return NextResponse.json({ record: record ?? null });
}

// POST /api/requests/[id]/impact-record — create or update structured impact record
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
  if (
    !canRecordImpact({
      userId: user.id,
      profileRole: profile.role,
      requesterId: request.requesterId,
    })
  ) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const { actualValue, notes } = body as { actualValue: string; notes?: string };

  if (!actualValue?.trim()) {
    return NextResponse.json({ error: "Actual value is required" }, { status: 400 });
  }

  // Use the request's existing prediction fields
  const predictedMetric = request.impactMetric ?? "Impact";
  const predictedValue = request.impactPrediction ?? "";

  const variancePercent = predictedValue
    ? calcVariance(predictedValue, actualValue.trim())
    : null;

  const [existing] = await db
    .select()
    .from(impactRecords)
    .where(eq(impactRecords.requestId, requestId));

  if (existing) {
    await db
      .update(impactRecords)
      .set({
        actualValue: actualValue.trim(),
        variancePercent: variancePercent !== null ? String(variancePercent.toFixed(1)) : null,
        notes: notes ?? null,
        measuredAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(impactRecords.id, existing.id));
  } else {
    await db.insert(impactRecords).values({
      requestId,
      pmId: user.id,
      predictedMetric,
      predictedValue,
      actualValue: actualValue.trim(),
      variancePercent: variancePercent !== null ? String(variancePercent.toFixed(1)) : null,
      notes: notes ?? null,
      measuredAt: new Date(),
    });
  }

  // Also sync back to requests table
  await db
    .update(requests)
    .set({ impactActual: actualValue.trim(), impactLoggedAt: new Date(), updatedAt: new Date() })
    .where(eq(requests.id, requestId));

  const varianceNote = variancePercent !== null
    ? ` (${variancePercent > 0 ? "+" : ""}${variancePercent.toFixed(1)}% vs prediction)`
    : "";

  await db.insert(comments).values({
    requestId,
    authorId: user.id,
    body: `📊 Impact logged: ${actualValue.trim()}${varianceNote}`,
    isSystem: true,
  });

  return NextResponse.json({ success: true, variancePercent });
}
