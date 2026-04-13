// lib/ai/morning-briefing.ts
import { generateObject } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { z } from "zod";
import { db } from "@/db";
import {
  requests,
  comments,
  proactiveAlerts,
  figmaUpdates,
  validationSignoffs,
  ideas,
  ideaVotes,
} from "@/db/schema";
import { and, eq, ne, gte, inArray, desc, sql, gt } from "drizzle-orm";
import type { MorningBriefContent } from "@/db/schema/morning_briefings";

const briefSchema = z.object({
  greeting: z.string().describe("Personalized greeting, e.g. 'Good morning, Yash'"),
  items: z
    .array(
      z.object({
        icon: z.string().describe("Single emoji: ✅ 💬 🔴 💡 ⏳ 🚀"),
        text: z.string().describe("One specific, conversational sentence"),
        href: z.string().optional().describe("Link to the relevant request, e.g. /dashboard/requests/{id}. Only include when referencing a specific request from the context."),
      })
    )
    .min(1)
    .max(5),
  oneThing: z
    .string()
    .describe("Single concrete action the user can take in the next hour. Start with 'Today:'"),
  oneThingHref: z
    .string()
    .optional()
    .describe("Link to the request the oneThing action refers to, e.g. /dashboard/requests/{id}. Only include when the action is about a specific request."),
});

async function gatherDesignerContext(userId: string, orgId: string) {
  const midnight = new Date();
  midnight.setUTCHours(0, 0, 0, 0);

  const activeRequests = await db
    .select({
      id: requests.id,
      title: requests.title,
      phase: requests.phase,
      designStage: requests.designStage,
      updatedAt: requests.updatedAt,
    })
    .from(requests)
    .where(
      and(
        eq(requests.orgId, orgId),
        eq(requests.designerOwnerId, userId),
        inArray(requests.phase, ["design", "dev"])
      )
    );

  const reqIds = activeRequests.map((r) => r.id);

  const overnightComments = reqIds.length
    ? await db
        .select({
          requestId: comments.requestId,
          body: comments.body,
          createdAt: comments.createdAt,
        })
        .from(comments)
        .where(
          and(
            inArray(comments.requestId, reqIds),
            gte(comments.createdAt, midnight),
            ne(comments.authorId, userId)
          )
        )
    : [];

  const proveReqIds = activeRequests
    .filter((r) => r.designStage === "prove")
    .map((r) => r.id);

  const mySignoffs = proveReqIds.length
    ? await db
        .select({ requestId: validationSignoffs.requestId })
        .from(validationSignoffs)
        .where(
          and(
            inArray(validationSignoffs.requestId, proveReqIds),
            eq(validationSignoffs.signerId, userId)
          )
        )
    : [];

  const signedIds = new Set(mySignoffs.map((s) => s.requestId));
  const pendingSignoffs = proveReqIds
    .filter((id) => !signedIds.has(id))
    .map((id) => activeRequests.find((r) => r.id === id)!);

  const alerts = await db
    .select({ type: proactiveAlerts.type, title: proactiveAlerts.title, body: proactiveAlerts.body })
    .from(proactiveAlerts)
    .where(
      and(
        eq(proactiveAlerts.recipientId, userId),
        eq(proactiveAlerts.dismissed, false),
        gt(proactiveAlerts.expiresAt, new Date())
      )
    );

  const figmaDrifts = reqIds.length
    ? await db
        .select({ id: figmaUpdates.id, requestId: figmaUpdates.requestId })
        .from(figmaUpdates)
        .where(
          and(
            inArray(figmaUpdates.requestId, reqIds),
            eq(figmaUpdates.postHandoff, true),
            eq(figmaUpdates.devReviewed, false)
          )
        )
    : [];

  return { activeRequests, overnightComments, pendingSignoffs, alerts, figmaDrifts };
}

async function gatherPmContext(userId: string, orgId: string) {
  const myRequests = await db
    .select({
      id: requests.id,
      title: requests.title,
      status: requests.status,
      phase: requests.phase,
      designStage: requests.designStage,
      impactActual: requests.impactActual,
      updatedAt: requests.updatedAt,
    })
    .from(requests)
    .where(and(eq(requests.orgId, orgId), eq(requests.requesterId, userId)))
    .orderBy(desc(requests.updatedAt))
    .limit(20);

  const proveReqIds = myRequests
    .filter((r) => r.designStage === "prove")
    .map((r) => r.id);

  const pmSignoffs = proveReqIds.length
    ? await db
        .select({ requestId: validationSignoffs.requestId })
        .from(validationSignoffs)
        .where(
          and(
            inArray(validationSignoffs.requestId, proveReqIds),
            eq(validationSignoffs.signerId, userId),
            eq(validationSignoffs.signerRole, "pm")
          )
        )
    : [];

  const signedIds = new Set(pmSignoffs.map((s) => s.requestId));
  const pendingSignoffs = proveReqIds
    .filter((id) => !signedIds.has(id))
    .map((id) => myRequests.find((r) => r.id === id)!);

  const needsImpact = myRequests.filter(
    (r) => r.phase === "track" && !r.impactActual
  );

  const alerts = await db
    .select({ type: proactiveAlerts.type, title: proactiveAlerts.title, body: proactiveAlerts.body })
    .from(proactiveAlerts)
    .where(
      and(
        eq(proactiveAlerts.recipientId, userId),
        eq(proactiveAlerts.dismissed, false),
        gt(proactiveAlerts.expiresAt, new Date())
      )
    );

  return { myRequests, pendingSignoffs, needsImpact, alerts };
}

async function gatherLeadContext(orgId: string) {
  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const startOfThisWeek = new Date(now);
  startOfThisWeek.setDate(now.getDate() - now.getDay());
  startOfThisWeek.setUTCHours(0, 0, 0, 0);
  const startOfLastWeek = new Date(startOfThisWeek.getTime() - 7 * 24 * 60 * 60 * 1000);

  const allOrgRequests = await db
    .select({ id: requests.id, phase: requests.phase, status: requests.status, updatedAt: requests.updatedAt })
    .from(requests)
    .where(eq(requests.orgId, orgId));

  const activePhaseCounts = {
    predesign: allOrgRequests.filter((r) => r.phase === "predesign").length,
    design: allOrgRequests.filter((r) => r.phase === "design").length,
    dev: allOrgRequests.filter((r) => r.phase === "dev").length,
    track: allOrgRequests.filter((r) => r.phase === "track").length,
  };

  const topRisks = await db
    .select({ type: proactiveAlerts.type, title: proactiveAlerts.title, body: proactiveAlerts.body, urgency: proactiveAlerts.urgency })
    .from(proactiveAlerts)
    .where(
      and(
        eq(proactiveAlerts.orgId, orgId),
        eq(proactiveAlerts.dismissed, false),
        gt(proactiveAlerts.expiresAt, now),
        inArray(proactiveAlerts.type, ["stall_escalation", "signoff_overdue"])
      )
    )
    .orderBy(desc(proactiveAlerts.generatedAt))
    .limit(2);

  // Note: using updatedAt as proxy for shipped date — no shippedAt column yet
  const recentlyShipped = allOrgRequests.filter(
    (r) => r.status === "shipped" && r.updatedAt >= sevenDaysAgo
  );

  const topIdeas = await db
    .select({
      id: ideas.id,
      title: ideas.title,
      voteCount: sql<number>`count(${ideaVotes.id})`.as("vote_count"),
    })
    .from(ideas)
    .leftJoin(ideaVotes, and(eq(ideaVotes.ideaId, ideas.id), eq(ideaVotes.voteType, "upvote")))
    .where(and(eq(ideas.orgId, orgId), eq(ideas.status, "pending_votes")))
    .groupBy(ideas.id, ideas.title)
    .having(sql`count(${ideaVotes.id}) > 3`)
    .orderBy(sql`count(${ideaVotes.id}) desc`)
    .limit(3);

  const shippedThisWeek = allOrgRequests.filter(
    (r) => r.status === "shipped" && r.updatedAt >= startOfThisWeek
  ).length;
  const shippedLastWeek = allOrgRequests.filter(
    (r) =>
      r.status === "shipped" &&
      r.updatedAt >= startOfLastWeek &&
      r.updatedAt < startOfThisWeek
  ).length;

  return { activePhaseCounts, topRisks, recentlyShipped, topIdeas, shippedThisWeek, shippedLastWeek };
}

export async function generateMorningBriefing(input: {
  userId: string;
  orgId: string;
  role: string;
  userName: string;
}): Promise<MorningBriefContent> {
  const { userId, orgId, role, userName } = input;

  let contextBlock = "";

  if (role === "designer" || role === "developer") {
    const ctx = await gatherDesignerContext(userId, orgId);
    contextBlock = `
ACTIVE REQUESTS (${ctx.activeRequests.length} total):
${ctx.activeRequests.map((r) => `- id:${r.id} "${r.title}" — phase: ${r.phase}, design stage: ${r.designStage ?? "n/a"}, last updated: ${r.updatedAt.toISOString().slice(0, 10)}`).join("\n") || "None"}

OVERNIGHT COMMENTS (since midnight, ${ctx.overnightComments.length} total):
${ctx.overnightComments.map((c) => `- On request id:${c.requestId}: "${c.body.slice(0, 100)}"`).join("\n") || "None"}

SIGN-OFFS NEEDED (prove stage, awaiting your approval, ${ctx.pendingSignoffs.length} total):
${ctx.pendingSignoffs.map((r) => `- id:${r.id} "${r.title}"`).join("\n") || "None"}

KF6 PROACTIVE ALERTS FOR YOU (${ctx.alerts.length} total):
${ctx.alerts.map((a) => `- [${a.type}] ${a.title}: ${a.body.slice(0, 100)}`).join("\n") || "None"}

FIGMA DRIFT ALERTS — post-handoff changes unreviewed (${ctx.figmaDrifts.length} total):
${ctx.figmaDrifts.length > 0 ? `${ctx.figmaDrifts.length} Figma update(s) on your requests need dev review` : "None"}
`;
  } else if (role === "pm") {
    const ctx = await gatherPmContext(userId, orgId);
    contextBlock = `
YOUR SUBMITTED REQUESTS (${ctx.myRequests.length} total):
${ctx.myRequests.slice(0, 10).map((r) => `- id:${r.id} "${r.title}" — status: ${r.status}, phase: ${r.phase}`).join("\n") || "None"}

SIGN-OFFS PENDING FROM YOU (prove stage, ${ctx.pendingSignoffs.length} total):
${ctx.pendingSignoffs.map((r) => `- id:${r.id} "${r.title}"`).join("\n") || "None"}

IMPACT PREDICTIONS TO LOG (in track, no actual logged, ${ctx.needsImpact.length} total):
${ctx.needsImpact.map((r) => `- id:${r.id} "${r.title}"`).join("\n") || "None"}

KF6 PROACTIVE ALERTS FOR YOU (${ctx.alerts.length} total):
${ctx.alerts.map((a) => `- [${a.type}] ${a.title}: ${a.body.slice(0, 100)}`).join("\n") || "None"}
`;
  } else if (role === "lead" || role === "admin") {
    const ctx = await gatherLeadContext(orgId);
    contextBlock = `
ORG REQUEST COUNTS BY PHASE:
- Predesign: ${ctx.activePhaseCounts.predesign}
- Design: ${ctx.activePhaseCounts.design}
- Dev: ${ctx.activePhaseCounts.dev}
- Track: ${ctx.activePhaseCounts.track}

TOP RISK ALERTS (${ctx.topRisks.length}):
${ctx.topRisks.map((a) => `- [${a.urgency}] ${a.title}: ${a.body.slice(0, 100)}`).join("\n") || "None"}

SHIPPED IN LAST 7 DAYS: ${ctx.recentlyShipped.length} request(s)

TOP-VOTED IDEAS (>3 votes, not yet validated):
${ctx.topIdeas.map((i) => `- "${i.title}" (${i.voteCount} votes)`).join("\n") || "None"}

MOMENTUM: ${ctx.shippedThisWeek} shipped this week vs ${ctx.shippedLastWeek} last week
`;
  } else {
    contextBlock = "No role-specific context available.";
  }

  const today = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  const { object } = await generateObject({
    model: anthropic("claude-3-5-haiku-20241022"),
    schema: briefSchema,
    prompt: `You are writing a morning briefing for a design ops platform called Lane.
Today is ${today}. The user is ${userName}, role: ${role}.

Write a warm, specific, actionable 30-second brief based on the context below.
- Items should name specific request titles, not generic status.
- Use the correct emoji for tone: ✅ (done/progress), 💬 (comments/feedback), 🔴 (risk/idle/urgent), 💡 (ideas), ⏳ (waiting/pending), 🚀 (shipped/momentum).
- oneThing must be a single concrete action the user can do in the next hour.
- If there's nothing notable, generate a motivating observation about the team state.
- Keep each item under 15 words.
- LINKS: When an item references a specific request (shown as id:UUID in context), set href to /dashboard/requests/{UUID}. Set oneThingHref when the oneThing action is about a specific request.

---
CONTEXT:
${contextBlock}
---`,
  });

  return object as MorningBriefContent;
}
