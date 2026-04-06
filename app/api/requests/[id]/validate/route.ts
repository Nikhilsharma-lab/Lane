import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { db } from "@/db";
import { requests, profiles, validationSignoffs, comments } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { sendEmail } from "@/lib/email";
import { signoffSubmittedEmail, allSignoffsEmail } from "@/lib/email/templates";

// Map profile role → signer_role enum
function signerRoleFromProfile(role: string): "designer" | "pm" | "design_head" | null {
  if (role === "designer") return "designer";
  if (role === "pm") return "pm";
  if (role === "lead" || role === "admin") return "design_head";
  return null;
}

// GET /api/requests/[id]/validate — fetch all sign-offs for this request
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

  const signoffs = await db
    .select()
    .from(validationSignoffs)
    .where(eq(validationSignoffs.requestId, requestId));

  const mySignerRole = signerRoleFromProfile(profile.role ?? "");

  return NextResponse.json({
    signoffs,
    mySignerRole,
    myProfileRole: profile.role,
  });
}

// POST /api/requests/[id]/validate — submit or update a sign-off
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

  if (request.designStage !== "prove") {
    return NextResponse.json({ error: "Request is not in the Prove stage" }, { status: 422 });
  }

  const body = await req.json().catch(() => ({}));
  const { decision, conditions, comments: commentText, signerRole: roleOverride } = body;

  // In dev/test environments, allow multi-role sign-off for solo testing.
  // Set ENABLE_MULTI_ROLE_TESTING=true in .env.local — never in production.
  // NODE_ENV is set to "production" by Next.js/Vercel at build time and cannot be overridden at runtime.
  let signerRole = signerRoleFromProfile(profile.role ?? "");
  if (
    process.env.NODE_ENV !== "production" &&
    process.env.ENABLE_MULTI_ROLE_TESTING === "true" &&
    roleOverride &&
    ["designer", "pm", "design_head"].includes(roleOverride)
  ) {
    signerRole = roleOverride as "designer" | "pm" | "design_head";
  }

  if (!signerRole) {
    return NextResponse.json({ error: "Your role cannot sign off on validations" }, { status: 403 });
  }

  if (!["approved", "approved_with_conditions", "rejected"].includes(decision)) {
    return NextResponse.json({ error: "Invalid decision" }, { status: 400 });
  }

  if (decision === "approved_with_conditions" && !conditions?.trim()) {
    return NextResponse.json({ error: "Conditions text is required for 'approved with conditions'" }, { status: 400 });
  }

  // Upsert: one sign-off per signer_role per request
  const [existing] = await db
    .select()
    .from(validationSignoffs)
    .where(
      and(
        eq(validationSignoffs.requestId, requestId),
        eq(validationSignoffs.signerRole, signerRole)
      )
    );

  if (existing) {
    await db
      .update(validationSignoffs)
      .set({
        signerId: user.id,
        decision,
        conditions: conditions ?? null,
        comments: commentText ?? null,
        signedAt: new Date(),
      })
      .where(eq(validationSignoffs.id, existing.id));
  } else {
    await db.insert(validationSignoffs).values({
      requestId,
      signerId: user.id,
      signerRole,
      decision,
      conditions: conditions ?? null,
      comments: commentText ?? null,
    });
  }

  // Add system comment
  const decisionLabel = decision === "approved" ? "approved" : decision === "approved_with_conditions" ? "approved with conditions" : "rejected";
  const roleLabel = signerRole === "designer" ? "Designer" : signerRole === "pm" ? "PM" : "Design Head";
  await db.insert(comments).values({
    requestId,
    authorId: null,
    body: `✅ ${roleLabel} ${decisionLabel} validation${conditions ? `: "${conditions}"` : ""}`,
    isSystem: true,
  });

  // Check if all 3 roles have approved (approved or approved_with_conditions)
  const allSignoffs = await db
    .select()
    .from(validationSignoffs)
    .where(eq(validationSignoffs.requestId, requestId));

  const roles = new Set(allSignoffs.map((s) => s.signerRole));
  const allApproved = ["designer", "pm", "design_head"].every((r) => {
    const signoff = allSignoffs.find((s) => s.signerRole === r);
    return signoff && signoff.decision !== "rejected";
  });

  if (allApproved && roles.has("designer") && roles.has("pm") && roles.has("design_head")) {
    // All 3 Prove sign-offs received — advance to Dev phase
    await db
      .update(requests)
      .set({
        phase: "dev",
        kanbanState: "todo",
        stage: "build",       // legacy
        status: "assigned",
        figmaVersionId: request.figmaUrl,
        figmaLockedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(requests.id, requestId));
    await db.insert(comments).values({
      requestId,
      authorId: null,
      body: "⭢ All 3 Prove sign-offs received — Figma locked, Dev phase started",
      isSystem: true,
    });

    // Notify requester that design was approved
    const [requester] = await db.select().from(profiles).where(eq(profiles.id, request.requesterId));
    if (requester?.email) {
      sendEmail({
        to: requester.email,
        subject: `Design approved: ${request.title}`,
        html: allSignoffsEmail({
          requestTitle: request.title,
          requestId,
          requesterName: requester.fullName ?? "there",
        }),
      });
    }

    return NextResponse.json({ success: true, autoAdvanced: true });
  }

  // If anyone rejected, add a note
  if (decision === "rejected") {
    await db.insert(comments).values({
      requestId,
      authorId: null,
      body: `⭠ Validation rejected by ${roleLabel} — design sent back for revision`,
      isSystem: true,
    });
  }

  // Notify org members about the sign-off update (except the person who just signed)
  const orgMembers = await db
    .select()
    .from(profiles)
    .where(eq(profiles.orgId, profile.orgId));

  const approvalCount = allSignoffs.filter((s) => s.decision !== "rejected").length;

  const notifyEmails = orgMembers
    .filter((m) => m.id !== user.id && m.email)
    .map((m) => m.email);

  if (notifyEmails.length) {
    sendEmail({
      to: notifyEmails,
      subject: `Validation update: ${request.title}`,
      html: signoffSubmittedEmail({
        requestTitle: request.title,
        requestId,
        signerName: profile.fullName ?? "Someone",
        signerRole: signerRole,
        decision,
        approvalsReceived: approvalCount,
      }),
    });
  }

  return NextResponse.json({ success: true, autoAdvanced: false });
}
