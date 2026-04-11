"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

const categoryColors: Record<string, string> = {
  design: "bg-[var(--phase-design)]/10 text-[var(--phase-design)] border-[var(--phase-design)]/20",
  feature: "bg-[var(--phase-dev)]/10 text-[var(--phase-dev)] border-[var(--phase-dev)]/20",
  workflow: "bg-cyan-500/10 text-cyan-400 border-cyan-500/20",
  performance: "bg-orange-500/10 text-orange-400 border-orange-500/20",
  ux: "bg-pink-500/10 text-pink-400 border-pink-500/20",
};

const statusColors: Record<string, string> = {
  pending_votes: "bg-accent text-muted-foreground border-border",
  validation: "bg-amber-500/10 text-amber-400 border-amber-500/20",
  approved: "bg-green-500/10 text-green-400 border-green-500/20",
  approved_with_conditions: "bg-green-500/10 text-green-400 border-green-500/20",
  rejected: "bg-red-500/10 text-red-400 border-red-500/20",
  archived: "bg-accent text-muted-foreground/60 border-border",
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
    <Card size="sm" className="hover:ring-foreground/20 transition-shadow">
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1.5 flex-wrap">
              <Badge
                variant="outline"
                className={`text-[10px] h-auto py-0.5 rounded capitalize ${categoryColors[category] ?? ""}`}
              >
                {category}
              </Badge>
              <Badge
                variant="outline"
                className={`text-[10px] h-auto py-0.5 rounded ${statusColors[status] ?? ""}`}
              >
                {statusLabels[status] ?? status}
              </Badge>
              {effortEstimateWeeks && (
                <span className="text-[10px] text-muted-foreground/60 font-mono">{effortEstimateWeeks}w est.</span>
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
      </CardHeader>

      <CardContent>
        {/* Problem snippet */}
        <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2">{problem}</p>
      </CardContent>

      <CardFooter className="justify-between gap-2">
        {/* Vote buttons */}
        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="xs"
            onClick={() => handleVote("upvote")}
            className={
              optimisticVotes.myVote === "upvote"
                ? "bg-green-500/15 border-green-500/30 text-green-400"
                : ""
            }
          >
            <span>&#x25B2;</span>
            <span className="font-mono">{optimisticVotes.upvotes}</span>
          </Button>
          <Button
            variant="outline"
            size="xs"
            onClick={() => handleVote("downvote")}
            className={
              optimisticVotes.myVote === "downvote"
                ? "bg-red-500/15 border-red-500/30 text-red-400"
                : ""
            }
          >
            <span>&#x25BC;</span>
            <span className="font-mono">{optimisticVotes.downvotes}</span>
          </Button>
        </div>

        <div className="flex items-center gap-3">
          {/* Author */}
          <span className="text-[11px] text-muted-foreground/60">
            {isAnonymous ? "Anonymous" : author}
          </span>

          {/* Time remaining */}
          {status === "pending_votes" && (
            <span className="text-[11px] text-muted-foreground/60 font-mono">{timeRemaining(votingEndsAt)}</span>
          )}

          {/* Validate button for leads */}
          {canValidate && onValidate && (
            <Button
              variant="outline"
              size="xs"
              onClick={onValidate}
              className="text-primary border-primary/20 hover:border-primary/40"
            >
              Validate
            </Button>
          )}
        </div>
      </CardFooter>
    </Card>
  );
}
