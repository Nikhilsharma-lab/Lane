import { NextRequest, NextResponse } from "next/server";
import { generateObject } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { db } from "@/db";
import { profiles, requests, assignments, requestAiAnalysis } from "@/db/schema";
import { eq, and, count, inArray } from "drizzle-orm";
import { checkAiRateLimit } from "@/lib/rate-limit";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rateLimited = await checkAiRateLimit(user.id);
  if (rateLimited) return rateLimited;

  const [profile] = await db.select().from(profiles).where(eq(profiles.id, user.id));
  if (!profile) return NextResponse.json({ error: "Profile not found" }, { status: 404 });

  const [request] = await db
    .select()
    .from(requests)
    .where(and(eq(requests.id, id), eq(requests.orgId, profile.orgId)));
  if (!request) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const members = await db
    .select({ id: profiles.id, fullName: profiles.fullName, role: profiles.role })
    .from(profiles)
    .where(eq(profiles.orgId, profile.orgId));

  // Compute active workload per member (assignments on non-completed org requests)
  const orgRequestIds = await db
    .select({ id: requests.id })
    .from(requests)
    .where(eq(requests.orgId, profile.orgId));

  const reqIds = orgRequestIds.map((r) => r.id).filter((rid) => rid !== id);

  const workloadRows =
    reqIds.length > 0
      ? await db
          .select({ assigneeId: assignments.assigneeId, count: count() })
          .from(assignments)
          .where(inArray(assignments.requestId, reqIds))
          .groupBy(assignments.assigneeId)
      : [];

  const workloadMap = Object.fromEntries(
    workloadRows.map((w) => [w.assigneeId, Number(w.count)])
  );

  // Skip already-assigned members
  const existing = await db
    .select({ assigneeId: assignments.assigneeId })
    .from(assignments)
    .where(eq(assignments.requestId, id));
  const assignedIds = new Set(existing.map((a) => a.assigneeId));

  const available = members.filter(
    (m) => !assignedIds.has(m.id) && (m.role === "designer" || m.role === "lead")
  );

  if (available.length === 0) {
    return NextResponse.json({ recommendedId: null, reasoning: "No available designers" });
  }

  const [triage] = await db
    .select()
    .from(requestAiAnalysis)
    .where(eq(requestAiAnalysis.requestId, id));

  const memberList = available
    .map((m) => `${m.fullName} (${m.role}, ${workloadMap[m.id] ?? 0} active) — id:${m.id}`)
    .join("\n");

  const { object } = await generateObject({
    model: anthropic("claude-3-5-haiku-20241022"),
    schema: z.object({
      recommendedId: z.string().nullable().describe("UUID of the recommended member, or null"),
      reasoning: z.string().describe("One sentence: why this person is the best fit"),
    }),
    prompt: `You are a design ops lead assigning a design request.

REQUEST:
Title: ${request.title}
Type: ${triage?.requestType ?? "unknown"}
Complexity: ${triage?.complexity ?? "?"}/5  Priority: ${request.priority ?? "?"}

AVAILABLE DESIGNERS (name, role, active assignments):
${memberList}

Pick the best lead designer. Prefer lower workload for high-complexity requests. Return the exact UUID from the id: field.`,
  });

  return NextResponse.json(object);
}
