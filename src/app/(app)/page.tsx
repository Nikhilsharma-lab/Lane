import { redirect } from "next/navigation";
import Link from "next/link";
import { getWorkspace } from "@/lib/ensure-workspace";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { relativeTime } from "@/lib/relative-time";
import { db, requests, profiles } from "@/db";
import { alias } from "drizzle-orm/pg-core";
import { eq, and, desc } from "drizzle-orm";
import { statusLabel } from "@/lib/request-status";
import { PickUpButton } from "./pick-up-button";

const MAX_REQUESTS_QUERY = 200;
const MAX_DONE_VISIBLE = 25;

export default async function RequestsBoard() {
  const workspace = await getWorkspace();
  if (!workspace) redirect("/login");
  if (workspace.needsOnboarding) redirect("/onboarding");

  const isGuest = workspace.role === "guest";
  const assignee = alias(profiles, "assignee");

  const allRequests = await db
    .select({
      id: requests.id,
      title: requests.title,
      reframedProblem: requests.reframedProblem,
      description: requests.description,
      status: requests.status,
      createdAt: requests.createdAt,
      creatorName: profiles.fullName,
      assigneeName: assignee.fullName,
    })
    .from(requests)
    .leftJoin(profiles, eq(requests.createdBy, profiles.id))
    .leftJoin(assignee, eq(requests.assignedTo, assignee.id))
    .where(
      isGuest
        ? and(
            eq(requests.orgId, workspace.orgId),
            eq(requests.createdBy, workspace.userId)
          )
        : eq(requests.orgId, workspace.orgId)
    )
    .orderBy(desc(requests.createdAt))
    .limit(MAX_REQUESTS_QUERY);

  const open = allRequests.filter((r) => r.status === "open");
  const inProgress = allRequests.filter((r) => r.status === "in_progress");
  const doneAll = allRequests.filter((r) => r.status === "done");
  const done = doneAll.slice(0, MAX_DONE_VISIBLE);

  const groups = [
    { key: "open", label: statusLabel("open"), requests: open, emptyText: "No open requests" },
    {
      key: "in_progress",
      label: statusLabel("in_progress"),
      requests: inProgress,
      emptyText: "Nothing in progress",
    },
    {
      key: "done",
      label: statusLabel("done"),
      requests: done,
      emptyText: "Nothing completed yet",
      truncatedFrom: doneAll.length > done.length ? doneAll.length : null,
    },
  ];

  return (
    <main className="flex-1 overflow-y-auto px-6 py-8">
      <div className="mb-8 flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold tracking-tight">
          {isGuest ? "My requests" : "Requests"}
        </h1>
        <Link href="/intake" className={buttonVariants({ size: "sm" })}>
          New request
        </Link>
      </div>

      {allRequests.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed py-16 text-center">
          <p className="text-base font-medium">No requests yet</p>
          <p className="mt-1 max-w-sm text-sm text-pretty text-muted-foreground">
            Lane starts when someone submits the first request. Describe the
            problem you're trying to solve, not a ready-made solution — the
            team will figure out the how.
          </p>
          <Link
            href="/intake"
            className={cn(buttonVariants({ size: "sm" }), "mt-5")}
          >
            Submit the first request
          </Link>
        </div>
      ) : (
        <div className="space-y-10">
          {groups.map((group) => (
            <section key={group.key} aria-labelledby={`section-${group.key}`}>
              <div className="mb-3 flex items-center gap-2">
                {group.key === "in_progress" && (
                  <span
                    aria-hidden="true"
                    className="size-1.5 shrink-0 rounded-full bg-brand"
                  />
                )}
                <h2
                  id={`section-${group.key}`}
                  className="text-sm font-medium text-foreground"
                >
                  {group.label}
                </h2>
                <span className="text-xs text-muted-foreground tabular-nums">
                  {group.requests.length}
                </span>
              </div>

              {group.requests.length === 0 ? (
                <p className="px-1 py-3 text-sm text-muted-foreground/70">
                  {group.emptyText}
                </p>
              ) : (
                <ul className="divide-y overflow-hidden rounded-xl border">
                  {group.requests.map((req) => (
                    <li
                      key={req.id}
                      className="relative flex items-start gap-4 px-4 py-3.5 transition-colors hover:bg-muted/40 has-[a:focus-visible]:ring-2 has-[a:focus-visible]:ring-ring has-[a:focus-visible]:ring-inset"
                    >
                      {req.status === "in_progress" && (
                        <>
                          <span
                            aria-hidden="true"
                            className="mt-1.5 size-2 shrink-0 rounded-full bg-brand"
                          />
                          <span className="sr-only">In progress</span>
                        </>
                      )}
                      <div className="min-w-0 flex-1">
                        {req.reframedProblem ? (
                          <>
                            <Link
                              href={`/requests/${req.id}`}
                              className="font-medium break-words after:absolute after:inset-0 hover:underline focus-visible:outline-none"
                            >
                              {req.reframedProblem}
                            </Link>
                            <p className="mt-1 text-sm text-muted-foreground">
                              {req.title}
                            </p>
                          </>
                        ) : (
                          <Link
                            href={`/requests/${req.id}`}
                            className="font-medium break-words after:absolute after:inset-0 hover:underline focus-visible:outline-none"
                          >
                            {req.title}
                          </Link>
                        )}
                        <p className="mt-2 text-xs text-muted-foreground/80">
                          {req.reframedProblem ? "Reframed · " : ""}
                          by {req.creatorName || "Unknown"} ·{" "}
                          {relativeTime(req.createdAt)}
                          {req.status === "in_progress" && req.assigneeName
                            ? ` · ${req.assigneeName}`
                            : ""}
                        </p>
                      </div>
                      {req.status === "open" && !isGuest && (
                        <PickUpButton
                          requestId={req.id}
                          title={req.title}
                          orgId={workspace.orgId}
                        />
                      )}
                    </li>
                  ))}
                </ul>
              )}

              {group.key === "done" && group.truncatedFrom && (
                <p className="mt-2 px-1 text-xs text-muted-foreground/70">
                  Showing the latest {MAX_DONE_VISIBLE} of {group.truncatedFrom}{" "}
                  completed.
                </p>
              )}
            </section>
          ))}
        </div>
      )}
    </main>
  );
}
