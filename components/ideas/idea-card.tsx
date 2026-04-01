"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const categoryColors: Record<string, string> = {
  design: "bg-purple-500/10 text-purple-400 border-purple-500/20",
  feature: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  workflow: "bg-cyan-500/10 text-cyan-400 border-cyan-500/20",
  performance: "bg-orange-500/10 text-orange-400 border-orange-500/20",
  ux: "bg-pink-500/10 text-pink-400 border-pink-500/20",
};

const statusColors: Record<string, string> = {
  pending_votes: "bg-zinc-800 text-zinc-400 border-zinc-700",
  validation: "bg-amber-500/10 text-amber-400 border-amber-500/20",
  approved: "bg-green-500/10 text-green-400 border-green-500/20",
  approved_with_conditions: "bg-green-500/10 text-green-400 border-green-500/20",
  rejected: "bg-red-500/10 text-red-400 border-red-500/20",
  archived: "bg-zinc-800/50 text-zinc-600 border-zinc-800",
};

const statusLabels: Record<string, string> = {
  pending_votes: "Voting",
  validation: "Validating",
  approved: "Approved",
  approved_with_conditions: "Approved",
  rejected: "Rejected",
  archived: "Archived",
};

interface IdeaCardProps {
  id: string;
  title: string;
  problem: string;
  category: string;
  status: string;
  upvotes: number;
  downvotes: number;
  netScore: number;
  userVote: string | null;
  author: string;
  isAnonymous: boolean;
  votingEndsAt: string;
  effortEstimateWeeks: number | null;
  onValidate?: () => void;
  profileRole: string;
}

function timeRemaining(votingEndsAt: string): string {
  const diff = new Date(votingEndsAt).getTime() - Date.now();
  if (diff <= 0) return "Ended";
  const days = Math.floor(diff / 86_400_000);
  if (days > 0) return `${days}d left`;
  const hours = Math.floor(diff / 3_600_000);
  return `${hours}h left`;
}

export function IdeaCard({
  id,
  title,
  problem,
  category,
  status,
  upvotes,
  downvotes,
  netScore,
  userVote,
  author,
  isAnonymous,
  votingEndsAt,
  effortEstimateWeeks,
  onValidate,
  profileRole,
}: IdeaCardProps) {
  const router = useRouter();
  const [localUpvotes, setLocalUpvotes] = useState(upvotes);
  const [localDownvotes, setLocalDownvotes] = useState(downvotes);
  const [localUserVote, setLocalUserVote] = useState<string | null>(userVote);
  const [voting, setVoting] = useState(false);

  async function handleVote(type: "upvote" | "downvote") {
    if (voting) return;
    setVoting(true);

    // Optimistic update
    const prev = localUserVote;
    if (prev === type) {
      // Toggle off
      setLocalUserVote(null);
      if (type === "upvote") setLocalUpvotes((v) => v - 1);
      else setLocalDownvotes((v) => v - 1);
    } else {
      if (prev) {
        if (prev === "upvote") setLocalUpvotes((v) => v - 1);
        else setLocalDownvotes((v) => v - 1);
      }
      setLocalUserVote(type);
      if (type === "upvote") setLocalUpvotes((v) => v + 1);
      else setLocalDownvotes((v) => v + 1);
    }

    try {
      await fetch(`/api/ideas/${id}/vote`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ voteType: type }),
      });
    } catch {
      // Revert optimistic on failure
      setLocalUpvotes(upvotes);
      setLocalDownvotes(downvotes);
      setLocalUserVote(prev);
    } finally {
      setVoting(false);
    }
  }

  const localNetScore = localUpvotes - localDownvotes;
  const canValidate = (profileRole === "lead" || profileRole === "admin") && status === "pending_votes";

  return (
    <div className="border border-zinc-800 rounded-xl p-4 bg-zinc-900/30 space-y-3 hover:border-zinc-700 transition-colors">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1.5 flex-wrap">
            <span className={`text-[10px] px-1.5 py-0.5 rounded border font-medium capitalize ${categoryColors[category] ?? "bg-zinc-800 text-zinc-500 border-zinc-700"}`}>
              {category}
            </span>
            <span className={`text-[10px] px-1.5 py-0.5 rounded border font-medium ${statusColors[status] ?? "bg-zinc-800 text-zinc-500 border-zinc-700"}`}>
              {statusLabels[status] ?? status}
            </span>
            {effortEstimateWeeks && (
              <span className="text-[10px] text-zinc-600">{effortEstimateWeeks}w est.</span>
            )}
          </div>
          <h3 className="text-sm font-medium text-zinc-200 leading-snug">{title}</h3>
        </div>

        {/* Net score */}
        <div className="shrink-0 flex flex-col items-center">
          <span className={`text-sm font-mono font-semibold ${localNetScore > 0 ? "text-green-400" : localNetScore < 0 ? "text-red-400" : "text-zinc-500"}`}>
            {localNetScore > 0 ? "+" : ""}{localNetScore}
          </span>
          <span className="text-[9px] text-zinc-700">score</span>
        </div>
      </div>

      {/* Problem snippet */}
      <p className="text-xs text-zinc-500 leading-relaxed line-clamp-2">{problem}</p>

      {/* Footer */}
      <div className="flex items-center justify-between gap-2">
        {/* Vote buttons */}
        <div className="flex items-center gap-1">
          <button
            onClick={() => handleVote("upvote")}
            disabled={voting}
            className={`flex items-center gap-1 text-xs px-2 py-1 rounded border transition-colors disabled:opacity-40 ${
              localUserVote === "upvote"
                ? "bg-green-500/15 border-green-500/30 text-green-400"
                : "border-zinc-800 text-zinc-500 hover:text-zinc-300 hover:border-zinc-700"
            }`}
          >
            <span>▲</span>
            <span className="font-mono">{localUpvotes}</span>
          </button>
          <button
            onClick={() => handleVote("downvote")}
            disabled={voting}
            className={`flex items-center gap-1 text-xs px-2 py-1 rounded border transition-colors disabled:opacity-40 ${
              localUserVote === "downvote"
                ? "bg-red-500/15 border-red-500/30 text-red-400"
                : "border-zinc-800 text-zinc-500 hover:text-zinc-300 hover:border-zinc-700"
            }`}
          >
            <span>▼</span>
            <span className="font-mono">{localDownvotes}</span>
          </button>
        </div>

        <div className="flex items-center gap-3">
          {/* Author */}
          <span className="text-[11px] text-zinc-600">
            {isAnonymous ? "Anonymous" : author}
          </span>

          {/* Time remaining */}
          {status === "pending_votes" && (
            <span className="text-[11px] text-zinc-700">{timeRemaining(votingEndsAt)}</span>
          )}

          {/* Validate button for leads */}
          {canValidate && onValidate && (
            <button
              onClick={onValidate}
              className="text-[11px] text-indigo-400 border border-indigo-500/20 rounded px-2 py-0.5 hover:border-indigo-500/40 hover:text-indigo-300 transition-colors"
            >
              Validate
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
