import { NextRequest, NextResponse } from "next/server";
import { generateObject } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { db } from "@/db";
import { profiles, requests, requestAiAnalysis } from "@/db/schema";
import { eq, and } from "drizzle-orm";
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

  const [request] = await db.select().from(requests).where(
    and(eq(requests.id, id), eq(requests.orgId, profile.orgId))
  );
  if (!request) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const [triage] = await db.select().from(requestAiAnalysis).where(
    eq(requestAiAnalysis.requestId, id)
  );

  const { object } = await generateObject({
    model: anthropic("claude-3-5-haiku-20241022"),
    schema: z.object({
      items: z.array(z.object({
        category: z.enum(["spec", "accessibility", "responsive", "edge_case", "assets", "handoff"]),
        label: z.string().describe("Short checklist item, max 10 words"),
        present: z.boolean().describe("True if this item appears to be addressed in the request"),
        note: z.string().nullable().describe("One-sentence note if missing or needs attention — null if present and fine"),
      })).describe("8-12 checklist items covering what a complete dev handoff needs"),
    }),
    prompt: `You are a design lead reviewing whether a design request is ready for developer handoff.

REQUEST:
Title: ${request.title}
Type: ${triage?.requestType ?? "unknown"}
Complexity: ${triage?.complexity ?? "?"}/5
Description: ${request.description}
Business context: ${request.businessContext ?? "Not provided"}
Success metrics: ${request.successMetrics ?? "Not provided"}
Figma link: ${request.figmaUrl ? "Provided" : "Not provided"}
Impact metric: ${request.impactMetric ?? "Not provided"}

Generate a handoff checklist with 8-12 items. For each item, evaluate whether it's been addressed based on what's in the request. Mark 'present: true' if it seems covered, 'present: false' if it's missing or unclear. Be specific — don't just say "missing" for everything.`,
  });

  return NextResponse.json(object);
}
