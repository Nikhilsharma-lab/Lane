import { redirect } from "next/navigation";
import Link from "next/link";
import { getWorkspace } from "@/lib/ensure-workspace";
import { buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { db, requests, profiles } from "@/db";
import { eq, and, desc } from "drizzle-orm";

const MAX_REQUESTS_QUERY = 200;
const MAX_DONE_VISIBLE = 25;

function statusLabel(status: string) {
  switch (status) {
    case "open":
      return "Open";
    case "in_progress":
      return "In Progress";
    case "done":
      return "Done";
    default:
      return status;
  }
}

function statusVariant(status: string) {
  switch (status) {
    case "open":
      return "secondary" as const;
    case "in_progress":
      return "default" as const;
    case "done":
      return "outline" as const;
    default:
      return "secondary" as const;
  }
}

export default async function RequestsBoard() {
  const workspace = await getWorkspace();
  if (!workspace) redirect("/login");
  if (workspace.needsOnboarding) redirect("/onboarding");

  const isGuest = workspace.role === "guest";

  const allRequests = await db
    .select({
      id: requests.id,
      title: requests.title,
      reframedProblem: requests.reframedProblem,
      description: requests.description,
      status: requests.status,
      createdAt: requests.createdAt,
      creatorName: profiles.fullName,
    })
    .from(requests)
    .leftJoin(profiles, eq(requests.createdBy, profiles.id))
    .where(
      isGuest
        ? and(eq(requests.orgId, workspace.orgId), eq(requests.createdBy, workspace.userId))
        : eq(requests.orgId, workspace.orgId)
    )
    .orderBy(desc(requests.createdAt))
    .limit(MAX_REQUESTS_QUERY);

  const open = allRequests.filter((r) => r.status === "open");
  const inProgress = allRequests.filter((r) => r.status === "in_progress");
  const done = allRequests.filter((r) => r.status === "done").slice(0, MAX_DONE_VISIBLE);

  const groups = [
    { label: "Open", requests: open, emptyText: "No open requests" },
    { label: "In Progress", requests: inProgress, emptyText: "Nothing in progress" },
    { label: "Done", requests: done, emptyText: "Nothing completed yet" },
  ];

  return (
    <main className="flex-1 overflow-y-auto px-6 py-6">
      <div className="mb-6 flex items-center justify-between">
        <h2 className="text-xl font-semibold tracking-tight">
          {isGuest ? "My Requests" : "Requests"}
        </h2>
        <Link href="/intake" className={buttonVariants({ size: "sm" })}>
          New request
        </Link>
      </div>

      <div className="space-y-8">
        {groups.map((group) => (
          <section key={group.label}>
            <div className="mb-3 flex items-center gap-2">
              <h3 className="text-sm font-medium text-muted-foreground">
                {group.label}
              </h3>
              <span className="text-xs text-muted-foreground">
                ({group.requests.length})
              </span>
            </div>

            {group.requests.length === 0 ? (
              <p className="py-4 text-sm text-muted-foreground/60">
                {group.emptyText}
              </p>
            ) : (
              <div className="space-y-2">
                {group.requests.map((req) => (
                  <Link
                    key={req.id}
                    href={`/requests/${req.id}`}
                    className="block rounded-lg border p-4 transition-colors hover:bg-muted/50"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0 flex-1">
                        <p className="font-medium">{req.title}</p>
                        <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                          {req.reframedProblem || req.description}
                        </p>
                        <p className="mt-2 text-xs text-muted-foreground/70">
                          by {req.creatorName || "Unknown"}
                        </p>
                      </div>
                      <Badge variant={statusVariant(req.status)}>
                        {statusLabel(req.status)}
                      </Badge>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </section>
        ))}
      </div>
    </main>
  );
}
