"use client";

import { useState } from "react";
import Link from "next/link";
import { NewRequestForm } from "./new-request-form";
import type { Request } from "@/db/schema";

const priorityColors: Record<string, string> = {
  p0: "bg-red-500/15 text-red-400 border-red-500/20",
  p1: "bg-orange-500/15 text-orange-400 border-orange-500/20",
  p2: "bg-yellow-500/15 text-yellow-400 border-yellow-500/20",
  p3: "bg-zinc-700/50 text-zinc-400 border-zinc-700",
};

const statusColors: Record<string, string> = {
  draft: "text-zinc-500",
  submitted: "text-blue-400",
  triaged: "text-purple-400",
  assigned: "text-yellow-400",
  in_progress: "text-green-400",
  in_review: "text-cyan-400",
  blocked: "text-red-400",
  completed: "text-zinc-500",
  shipped: "text-zinc-400",
};

function formatDate(date: Date | string) {
  return new Date(date).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function deadlineStatus(deadlineAt: Date | string | null) {
  if (!deadlineAt) return null;
  const days = (new Date(deadlineAt).getTime() - Date.now()) / 86_400_000;
  if (days < 0) return { label: "overdue", color: "text-red-400 bg-red-500/10 border-red-500/20" };
  if (days <= 3) return { label: `${Math.ceil(days)}d left`, color: "text-orange-400 bg-orange-500/10 border-orange-500/20" };
  if (days <= 7) return { label: `${Math.ceil(days)}d left`, color: "text-yellow-500/80 bg-yellow-500/10 border-yellow-500/20" };
  return null; // not urgent
}

interface Props {
  requests: Request[];
  myRequestIds?: Set<string>;
  assigneesByRequest?: Record<string, string[]>;
}

const DONE_STATUSES = new Set(["completed", "shipped"]);
const STALL_EXEMPT = new Set(["draft", "completed", "shipped", "blocked"]);
const STALL_DAYS = 5;

function isStalled(r: Request) {
  if (STALL_EXEMPT.has(r.status)) return false;
  const daysSince = (Date.now() - new Date(r.updatedAt).getTime()) / 86_400_000;
  return daysSince >= STALL_DAYS;
}

const TYPE_LABELS: Record<string, string> = {
  feature: "Feature", bug: "Bug", research: "Research",
  content: "Content", infra: "Infra", process: "Process", other: "Other",
};

function Initials({ name }: { name: string }) {
  const init = name.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();
  return (
    <div className="w-5 h-5 rounded-full bg-zinc-700 border border-zinc-600 flex items-center justify-center text-[9px] font-medium text-zinc-300 shrink-0">
      {init}
    </div>
  );
}

export function RequestList({ requests, myRequestIds, assigneesByRequest = {} }: Props) {
  const [showForm, setShowForm] = useState(false);
  const [filter, setFilter] = useState<"all" | "mine">("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "done">("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [search, setSearch] = useState("");

  const hasMine = myRequestIds && myRequestIds.size > 0;

  // Derive available types from current request list
  const availableTypes = [...new Set(requests.map((r) => r.requestType).filter(Boolean))] as string[];

  let visible = filter === "mine" && myRequestIds
    ? requests.filter((r) => myRequestIds.has(r.id))
    : requests;

  if (statusFilter === "active") visible = visible.filter((r) => !DONE_STATUSES.has(r.status));
  if (statusFilter === "done") visible = visible.filter((r) => DONE_STATUSES.has(r.status));
  if (typeFilter !== "all") visible = visible.filter((r) => r.requestType === typeFilter);

  if (search.trim()) {
    const q = search.toLowerCase();
    visible = visible.filter(
      (r) =>
        r.title.toLowerCase().includes(q) ||
        r.description.toLowerCase().includes(q) ||
        (r.businessContext ?? "").toLowerCase().includes(q)
    );
  }

  return (
    <>
      {showForm && <NewRequestForm onClose={() => setShowForm(false)} />}

      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <div>
            <h1 className="text-xl font-semibold text-white">Requests</h1>
            <p className="text-zinc-500 text-sm mt-0.5">{visible.length} of {requests.length}</p>
          </div>
          {hasMine && (
            <div className="flex items-center gap-1 bg-zinc-900 border border-zinc-800 rounded-lg p-1">
              <button
                onClick={() => setFilter("all")}
                className={`text-xs px-2.5 py-1 rounded transition-colors ${filter === "all" ? "bg-zinc-700 text-white" : "text-zinc-500 hover:text-zinc-300"}`}
              >
                All
              </button>
              <button
                onClick={() => setFilter("mine")}
                className={`text-xs px-2.5 py-1 rounded transition-colors ${filter === "mine" ? "bg-zinc-700 text-white" : "text-zinc-500 hover:text-zinc-300"}`}
              >
                Mine
              </button>
            </div>
          )}
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="bg-white text-zinc-900 rounded-lg px-4 py-2 text-sm font-medium hover:bg-zinc-100 transition-colors"
        >
          + New request
        </button>
      </div>

      {/* Search + Filters */}
      <div className="space-y-2 mb-4">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search requests…"
          className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-700 focus:outline-none focus:border-zinc-600 transition-colors"
        />

        <div className="flex items-center gap-2 flex-wrap">
          {/* Status */}
          <div className="flex items-center gap-1 bg-zinc-900 border border-zinc-800 rounded-lg p-1">
            {(["all", "active", "done"] as const).map((s) => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={`text-xs px-2.5 py-1 rounded capitalize transition-colors ${
                  statusFilter === s ? "bg-zinc-700 text-white" : "text-zinc-500 hover:text-zinc-300"
                }`}
              >
                {s}
              </button>
            ))}
          </div>

          {/* Type */}
          {availableTypes.length > 0 && (
            <div className="flex items-center gap-1 bg-zinc-900 border border-zinc-800 rounded-lg p-1 flex-wrap">
              <button
                onClick={() => setTypeFilter("all")}
                className={`text-xs px-2.5 py-1 rounded transition-colors ${
                  typeFilter === "all" ? "bg-zinc-700 text-white" : "text-zinc-500 hover:text-zinc-300"
                }`}
              >
                All types
              </button>
              {availableTypes.map((t) => (
                <button
                  key={t}
                  onClick={() => setTypeFilter(t)}
                  className={`text-xs px-2.5 py-1 rounded capitalize transition-colors ${
                    typeFilter === t ? "bg-zinc-700 text-white" : "text-zinc-500 hover:text-zinc-300"
                  }`}
                >
                  {TYPE_LABELS[t] ?? t}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {visible.length === 0 ? (
        <div className="border border-zinc-800 rounded-xl p-16 text-center">
          {search ? (
            <>
              <p className="text-zinc-600 text-sm mb-1">No results for &ldquo;{search}&rdquo;</p>
              <button onClick={() => setSearch("")} className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors mt-2">
                Clear search
              </button>
            </>
          ) : (
            <>
              <p className="text-zinc-600 text-sm mb-1">No requests yet</p>
              <p className="text-zinc-700 text-xs mb-5">Submit one to see AI triage in action</p>
              <button
                onClick={() => setShowForm(true)}
                className="text-sm text-zinc-400 hover:text-white border border-zinc-700 hover:border-zinc-500 rounded-lg px-4 py-2 transition-colors"
              >
                + New request
              </button>
            </>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {visible.map((r) => {
            const deadline = deadlineStatus(r.deadlineAt);
            const assignees = assigneesByRequest[r.id] ?? [];
            return (
              <Link
                key={r.id}
                href={`/dashboard/requests/${r.id}`}
                className="block border border-zinc-800 rounded-xl px-5 py-4 hover:border-zinc-700 transition-colors"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      {r.priority && (
                        <span className={`text-xs px-1.5 py-0.5 rounded border font-mono ${priorityColors[r.priority]}`}>
                          {r.priority.toUpperCase()}
                        </span>
                      )}
                      {r.complexity && (
                        <span className="text-xs text-zinc-600">
                          {"▪".repeat(r.complexity)}{"▫".repeat(5 - r.complexity)}
                        </span>
                      )}
                      {r.requestType && (
                        <span className="text-xs text-zinc-600 capitalize">{r.requestType}</span>
                      )}
                      {deadline && (
                        <span className={`text-[10px] px-1.5 py-0.5 rounded border ${deadline.color}`}>
                          {deadline.label}
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-white font-medium truncate">{r.title}</p>
                    <p className="text-xs text-zinc-500 mt-0.5 line-clamp-1">{r.description}</p>
                  </div>
                  <div className="flex flex-col items-end gap-1.5 shrink-0">
                    <div className="flex items-center gap-1.5">
                      {isStalled(r) && (
                        <span className="text-[10px] text-yellow-500/70 bg-yellow-500/10 border border-yellow-500/20 rounded px-1.5 py-0.5">
                          stalled
                        </span>
                      )}
                      <span className={`text-xs ${statusColors[r.status] ?? "text-zinc-500"}`}>
                        {r.status.replace(/_/g, " ")}
                      </span>
                    </div>
                    {assignees.length > 0 && (
                      <div className="flex items-center gap-0.5">
                        {assignees.slice(0, 3).map((name) => (
                          <Initials key={name} name={name} />
                        ))}
                        {assignees.length > 3 && (
                          <span className="text-[9px] text-zinc-600 ml-0.5">+{assignees.length - 3}</span>
                        )}
                      </div>
                    )}
                    <span className="text-xs text-zinc-700">{formatDate(r.createdAt)}</span>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </>
  );
}
