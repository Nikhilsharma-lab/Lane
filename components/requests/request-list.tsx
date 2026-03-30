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

interface Props {
  requests: Request[];
  myRequestIds?: Set<string>;
}

export function RequestList({ requests, myRequestIds }: Props) {
  const [showForm, setShowForm] = useState(false);
  const [filter, setFilter] = useState<"all" | "mine">("all");

  const hasMine = myRequestIds && myRequestIds.size > 0;
  const visible = filter === "mine" && myRequestIds
    ? requests.filter((r) => myRequestIds.has(r.id))
    : requests;

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

      {visible.length === 0 ? (
        <div className="border border-zinc-800 rounded-xl p-16 text-center">
          <p className="text-zinc-600 text-sm mb-1">No requests yet</p>
          <p className="text-zinc-700 text-xs mb-5">Submit one to see AI triage in action</p>
          <button
            onClick={() => setShowForm(true)}
            className="text-sm text-zinc-400 hover:text-white border border-zinc-700 hover:border-zinc-500 rounded-lg px-4 py-2 transition-colors"
          >
            + New request
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          {visible.map((r) => (
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
                  </div>
                  <p className="text-sm text-white font-medium truncate">{r.title}</p>
                  <p className="text-xs text-zinc-500 mt-0.5 line-clamp-1">{r.description}</p>
                </div>
                <div className="flex flex-col items-end gap-1 shrink-0">
                  <span className={`text-xs ${statusColors[r.status] ?? "text-zinc-500"}`}>
                    {r.status.replace(/_/g, " ")}
                  </span>
                  <span className="text-xs text-zinc-700">{formatDate(r.createdAt)}</span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
