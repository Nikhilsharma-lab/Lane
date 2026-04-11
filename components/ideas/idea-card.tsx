"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const categoryColors: Record<string, string> = {
  design: "bg-[#A394C7]/10 text-[#A394C7] border-[#A394C7]/20",
  feature: "bg-[#7DA5C4]/10 text-[#7DA5C4] border-[#7DA5C4]/20",
  workflow: "bg-cyan-500/10 text-cyan-400 border-cyan-500/20",
  performance: "bg-orange-500/10 text-orange-400 border-orange-500/20",
  ux: "bg-pink-500/10 text-pink-400 border-pink-500/20",
};

const statusColors: Record<string, string> = {
  pending_votes: "bg-accent text-muted-foreground border",
  validation: "bg-amber-500/10 text-amber-400 border-amber-500/20",
  approved: "bg-green-500/10 text-green-400 border-green-500/20",
  approved_with_conditions: "bg-green-500/10 text-green-400 border-green-500/20",
  rejected: "bg-red-500/10 text-red-400 border-red-500/20",
  archived: "bg-accent text-muted-foreground/60 border",
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
  const [optimisticVotes, setOptimisticVotes] = useState({
    upvotes: upvotes ?? 0,
    downvotes: downvotes ?? 0,
    myVote: userVote as "upvote" | "downvote" | null,
  });

  async function handleVote(type: "upvote" | "downvote") {
    const previous = optimisticVotes;

    setOptimisticVotes((prev) => {
      const isToggle = prev.myVote === type;
      return {
        upvotes:
          type === "upvote"
            ? isToggle ? prev.upvotes - 1 : prev.upvotes + 1
            : prev.myVote === "upvote" ? prev.upvotes - 1 : prev.upvotes,
        downvotes:
          type === "downvote"
            ? isToggle ? prev.downvotes - 1 : prev.downvotes + 1
            : prev.myVote === "downvote" ? prev.downvotes - 1 : prev.downvotes,
        myVote: isToggle ? null : type,
      };
    });

    const res = await fetch(`/api/ideas/${id}/vote`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ voteType: type }),
    });

    if (!res.ok) {
      setOptimisticVotes(previous);
    }
  }

  const localNetScore = optimisticVotes.upvotes - optimisticVotes.downvotes;
  const canValidate = (profileRole === "lead" || profileRole === "admin") && status === "pending_votes";

  return (
    <div className="border rounded-xl p-4 bg-card space-y-3 hover:border-border/80 transition-colors">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1.5 flex-wrap">
            <span className={`text-[10px] px-1.5 py-0.5 rounded border font-medium capitalize ${categoryColors[category] ?? "bg-accent text-muted-foreground border"}`}>
              {category}
            </span>
            <span className={`text-[10px] px-1.5 py-0.5 rounded border font-medium ${statusColors[status] ?? "bg-accent text-muted-foreground border"}`}>
              {statusLabels[status] ?? status}
            </span>
            {effortEstimateWeeks && (
              <span className="text-[10px] text-muted-foreground/60">{effortEstimateWeeks}w est.</span>
            )}
          </div>
          <h3 className="text-sm font-medium text-foreground leading-snug">{title}</h3>
        </div>

        {/* Net score */}
        <div className="shrink-0 flex flex-col items-center">
          <span className={`text-sm font-mono font-semibold ${localNetScore > 0 ? "text-green-400" : localNetScore < 0 ? "text-red-400" : "text-muted-foreground"}`}>
            {localNetScore > 0 ? "+" : ""}{localNetScore}
          </span>
          <span className="text-[9px] text-muted-foreground/60">score</span>
        </div>
      </div>

      {/* Problem snippet */}
      <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2">{problem}</p>

      {/* Footer */}
      <div className="flex items-center justify-between gap-2">
        {/* Vote buttons */}
        <div className="flex items-center gap-1">
          <button
            onClick={() => handleVote("upvote")}
            className={`flex items-center gap-1 text-xs px-2 py-1 rounded border transition-colors ${
              optimisticVotes.myVote === "upvote"
                ? "bg-green-500/15 border-green-500/30 text-green-400"
                : "border text-muted-foreground hover:text-foreground hover:border-border/80"
            }`}
          >
            <span>▲</span>
            <span className="font-mono">{optimisticVotes.upvotes}</span>
          </button>
          <button
            onClick={() => handleVote("downvote")}
            className={`flex items-center gap-1 text-xs px-2 py-1 rounded border transition-colors ${
              optimisticVotes.myVote === "downvote"
                ? "bg-red-500/15 border-red-500/30 text-red-400"
                : "border text-muted-foreground hover:text-foreground hover:border-border/80"
            }`}
          >
            <span>▼</span>
            <span className="font-mono">{optimisticVotes.downvotes}</span>
          </button>
        </div>

        <div className="flex items-center gap-3">
          {/* Author */}
          <span className="text-[11px] text-muted-foreground/60">
            {isAnonymous ? "Anonymous" : author}
          </span>

          {/* Time remaining */}
          {status === "pending_votes" && (
            <span className="text-[11px] text-muted-foreground/60">{timeRemaining(votingEndsAt)}</span>
          )}

          {/* Validate button for leads */}
          {canValidate && onValidate && (
            <button
              onClick={onValidate}
              className="text-[11px] text-primary border border-primary/20 rounded px-2 py-0.5 hover:border-primary/40 transition-colors"
            >
              Validate
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
