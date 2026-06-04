import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { ensureWorkspace } from "@/lib/ensure-workspace";
import { logout } from "./(auth)/actions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { db, requests, profiles } from "@/db";
import { eq, desc } from "drizzle-orm";

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

export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Defense-in-depth: proxy already redirects, but getUser() is the secure
  // server-side check recommended by Supabase (proxy tokens can be stale).
  if (!user) {
    redirect("/login");
  }

  const workspace = await ensureWorkspace();
  if (!workspace) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <p className="text-destructive">
          Something went wrong setting up your workspace. Please try logging out
          and back in.
        </p>
      </div>
    );
  }

  // Fetch requests for this workspace — all Open/In Progress, last 25 Done
  const allRequests = await db
    .select({
      id: requests.id,
      title: requests.title,
      reframedProblem: requests.reframedProblem,
      description: requests.description,
      classification: requests.classification,
      status: requests.status,
      assignedTo: requests.assignedTo,
      createdAt: requests.createdAt,
      creatorName: profiles.fullName,
    })
    .from(requests)
    .leftJoin(profiles, eq(requests.createdBy, profiles.id))
    .where(eq(requests.orgId, workspace.orgId))
    .orderBy(desc(requests.createdAt))
    .limit(200);

  // Group by status — cap Done to 25 most recent
  const open = allRequests.filter((r) => r.status === "open");
  const inProgress = allRequests.filter((r) => r.status === "in_progress");
  const done = allRequests.filter((r) => r.status === "done").slice(0, 25);

  const groups = [
    { label: "Open", requests: open, emptyText: "No open requests" },
    { label: "In Progress", requests: inProgress, emptyText: "Nothing in progress" },
    { label: "Done", requests: done, emptyText: "Nothing completed yet" },
  ];

  return (
    <div className="flex flex-1 flex-col">
      <header className="flex items-center justify-between border-b px-6 py-4">
        <h1 className="text-lg font-semibold tracking-tight">Lane</h1>
        <div className="flex items-center gap-4">
          <span className="text-sm text-muted-foreground">{user.email}</span>
          <form action={logout}>
            <Button variant="outline" size="sm" type="submit">
              Log out
            </Button>
          </form>
        </div>
      </header>

      <main className="flex-1 px-6 py-6">
        <div className="mb-6 flex items-center justify-between">
          <h2 className="text-xl font-semibold tracking-tight">Requests</h2>
          <Link href="/intake">
            <Button size="sm">New request</Button>
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
    </div>
  );
}
