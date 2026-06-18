import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { db, requests, profiles, comments } from "@/db";
import { eq, asc } from "drizzle-orm";
import { getWorkspace } from "@/lib/ensure-workspace";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { LifecycleButtons } from "./lifecycle-buttons";
import { CommentForm } from "./comment-form";

function statusLabel(status: string) {
  switch (status) {
    case "open": return "Open";
    case "in_progress": return "In Progress";
    case "done": return "Done";
    default: return status;
  }
}

function statusVariant(status: string) {
  switch (status) {
    case "open": return "secondary" as const;
    case "in_progress": return "default" as const;
    case "done": return "outline" as const;
    default: return "secondary" as const;
  }
}

function classificationLabel(c: string | null) {
  switch (c) {
    case "problem": return "Problem-framed";
    case "solution": return "Solution → Reframed";
    case "hybrid": return "Hybrid → Reframed";
    default: return null;
  }
}

export default async function RequestDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  // Validate UUID before querying — avoids Postgres cast errors on bad URLs
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    notFound();
  }

  const result = await getWorkspace();
  if (!result) redirect("/login");
  if (result.needsOnboarding) redirect("/onboarding");

  const context = { userId: result.userId, orgId: result.orgId };

  // Fetch request with creator and assignee names
  const [req] = await db
    .select({
      id: requests.id,
      title: requests.title,
      description: requests.description,
      reframedProblem: requests.reframedProblem,
      extractedSolution: requests.extractedSolution,
      classification: requests.classification,
      status: requests.status,
      assignedTo: requests.assignedTo,
      createdBy: requests.createdBy,
      createdAt: requests.createdAt,
      orgId: requests.orgId,
    })
    .from(requests)
    .where(eq(requests.id, id));

  if (!req || req.orgId !== context.orgId) {
    notFound();
  }

  const isGuest = result.role === "guest";
  if (isGuest && req.createdBy !== context.userId) {
    notFound();
  }

  // Get creator name
  const [creator] = await db
    .select({ fullName: profiles.fullName })
    .from(profiles)
    .where(eq(profiles.id, req.createdBy));

  // Get assignee name if assigned
  let assigneeName: string | null = null;
  if (req.assignedTo) {
    const [assignee] = await db
      .select({ fullName: profiles.fullName })
      .from(profiles)
      .where(eq(profiles.id, req.assignedTo));
    assigneeName = assignee?.fullName ?? null;
  }

  const clLabel = classificationLabel(req.classification);

  return (
    <div className="flex flex-1 flex-col">
      {/* Header */}
      <header className="flex items-center gap-4 border-b px-6 py-4">
        <Link
          href="/"
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          ← Back
        </Link>
        <Separator orientation="vertical" className="h-4" />
        <h1 className="text-lg font-semibold tracking-tight">
          {req.title}
        </h1>
      </header>

      <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-8">
        {/* Status + actions */}
        <div className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Badge variant={statusVariant(req.status)}>
              {statusLabel(req.status)}
            </Badge>
            {clLabel && (
              <span className="text-xs text-muted-foreground">{clLabel}</span>
            )}
          </div>
          {!isGuest && <LifecycleButtons requestId={req.id} status={req.status} context={context} />}
        </div>

        {/* Reframed problem (if solution/hybrid) */}
        {req.reframedProblem && (
          <Card className="mb-6 border-primary/20 bg-primary/[0.02]">
            <CardHeader>
              <CardDescription>Reframed problem</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm whitespace-pre-wrap">
                {req.reframedProblem}
              </p>
            </CardContent>
          </Card>
        )}

        {/* Original description */}
        <Card className="mb-6">
          <CardHeader>
            <CardDescription>Original description</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground whitespace-pre-wrap">
              {req.description}
            </p>
          </CardContent>
        </Card>

        {/* Extracted solution (hybrid only) */}
        {req.extractedSolution && (
          <Card className="mb-6">
            <CardHeader>
              <CardDescription>Proposed solution (preserved)</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                {req.extractedSolution}
              </p>
            </CardContent>
          </Card>
        )}

        {/* Metadata */}
        <div className="space-y-2 text-sm text-muted-foreground">
          <p>Submitted by {creator?.fullName ?? "Unknown"} · {new Date(req.createdAt).toLocaleDateString()}</p>
          {!isGuest && assigneeName && <p>Assigned to {assigneeName}</p>}
        </div>

        {/* Comments */}
        <Separator className="my-8" />
        <CommentsSection requestId={req.id} context={context} />
      </main>
    </div>
  );
}

async function CommentsSection({ requestId, context }: { requestId: string; context: { userId: string; orgId: string } }) {
  const allComments = await db
    .select({
      id: comments.id,
      body: comments.body,
      createdAt: comments.createdAt,
      authorName: profiles.fullName,
    })
    .from(comments)
    .leftJoin(profiles, eq(comments.authorId, profiles.id))
    .where(eq(comments.requestId, requestId))
    .orderBy(asc(comments.createdAt));

  return (
    <div>
      <h3 className="mb-4 text-sm font-medium">
        Comments ({allComments.length})
      </h3>

      {allComments.length > 0 && (
        <div className="mb-6 space-y-4">
          {allComments.map((c) => (
            <div key={c.id} className="rounded-lg border p-4">
              <div className="mb-2 flex items-center gap-2 text-xs text-muted-foreground">
                <span className="font-medium text-foreground">
                  {c.authorName ?? "Unknown"}
                </span>
                <span>·</span>
                <span>{new Date(c.createdAt).toLocaleString()}</span>
              </div>
              <p className="text-sm whitespace-pre-wrap">{c.body}</p>
            </div>
          ))}
        </div>
      )}

      <CommentForm requestId={requestId} context={context} />
    </div>
  );
}
