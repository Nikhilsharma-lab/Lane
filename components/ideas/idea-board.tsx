"use client";

import { useState } from "react";
import { IdeaCard } from "./idea-card";
import { IdeaForm } from "./idea-form";
import { IdeaValidationPanel } from "./idea-validation-panel";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";

const STATUS_TABS = [
  { key: null, label: "All" },
  { key: "pending_votes", label: "Voting" },
  { key: "validation", label: "Validating" },
  { key: "approved", label: "Approved" },
  { key: "rejected", label: "Rejected" },
] as const;

const SORT_OPTIONS = [
  { key: "net_score", label: "Most Voted" },
  { key: "newest", label: "Newest" },
  { key: "ending_soon", label: "Ending Soon" },
] as const;

type StatusKey = (typeof STATUS_TABS)[number]["key"];
type SortKey = (typeof SORT_OPTIONS)[number]["key"];

interface IdeaRow {
  id: string;
  title: string;
  problem: string;
  category: string;
  status: string;
  upvotes: number;
  downvotes: number;
  netScore: number;
  userVote: string | null;
  authorId: string;
  isAnonymous: boolean;
  votingEndsAt: string;
  effortEstimateWeeks: number | null;
  authorName: string;
}

interface IdeaBoardProps {
  initialIdeas: IdeaRow[];
  profileRole: string;
}

export function IdeaBoard({ initialIdeas, profileRole }: IdeaBoardProps) {
  const ideas = initialIdeas;
  const [activeStatus, setActiveStatus] = useState<StatusKey>(null);
  const [sort, setSort] = useState<SortKey>("net_score");
  const [showForm, setShowForm] = useState(false);
  const [validateIdeaId, setValidateIdeaId] = useState<string | null>(null);
  const [validateIdeaTitle, setValidateIdeaTitle] = useState("");

  const filtered = ideas
    .filter((idea) => activeStatus === null || idea.status === activeStatus)
    .sort((a, b) => {
      if (sort === "net_score") return b.netScore - a.netScore;
      if (sort === "newest") return new Date(b.votingEndsAt).getTime() - new Date(a.votingEndsAt).getTime();
      if (sort === "ending_soon") return new Date(a.votingEndsAt).getTime() - new Date(b.votingEndsAt).getTime();
      return 0;
    });

  const counts: Record<string, number> = {};
  for (const idea of ideas) {
    counts[idea.status] = (counts[idea.status] ?? 0) + 1;
  }

  return (
    <>
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-4 mb-6">
        {/* Filter tabs */}
        <Tabs
          value={activeStatus ?? "all"}
          onValueChange={(v) => setActiveStatus(v === "all" ? null : v as StatusKey)}
        >
          <TabsList variant="default">
            {STATUS_TABS.map((tab) => {
              const count = tab.key === null ? ideas.length : (counts[tab.key] ?? 0);
              return (
                <TabsTrigger key={String(tab.key)} value={tab.key ?? "all"}>
                  {tab.label}
                  {count > 0 && (
                    <span className="ml-1.5 text-[10px] font-mono text-muted-foreground">
                      {count}
                    </span>
                  )}
                </TabsTrigger>
              );
            })}
          </TabsList>
        </Tabs>

        <div className="flex items-center gap-2">
          {/* Sort */}
          <NativeSelect
            value={sort}
            onChange={(e) => setSort(e.target.value as SortKey)}
          >
            {SORT_OPTIONS.map((s) => (
              <NativeSelectOption key={s.key} value={s.key}>{s.label}</NativeSelectOption>
            ))}
          </NativeSelect>

          {/* Submit button */}
          <Button size="sm" onClick={() => setShowForm(true)}>
            + Submit idea
          </Button>
        </div>
      </div>

      {/* Empty state */}
      {filtered.length === 0 && (
        <div className="border border-border rounded-xl px-6 py-12 text-center">
          <p className="text-sm text-muted-foreground/60">
            {activeStatus ? `No ideas in "${activeStatus}" status` : "No ideas yet -- be the first to submit one!"}
          </p>
        </div>
      )}

      {/* Ideas grid */}
      <div className="space-y-3">
        {filtered.map((idea) => (
          <IdeaCard
            key={idea.id}
            id={idea.id}
            title={idea.title}
            problem={idea.problem}
            category={idea.category}
            status={idea.status}
            upvotes={idea.upvotes}
            downvotes={idea.downvotes}
            netScore={idea.netScore}
            userVote={idea.userVote}
            author={idea.authorName}
            isAnonymous={idea.isAnonymous}
            votingEndsAt={idea.votingEndsAt}
            effortEstimateWeeks={idea.effortEstimateWeeks}
            profileRole={profileRole}
            onValidate={
              profileRole === "lead" || profileRole === "admin"
                ? () => {
                    setValidateIdeaId(idea.id);
                    setValidateIdeaTitle(idea.title);
                  }
                : undefined
            }
          />
        ))}
      </div>

      {showForm && <IdeaForm onClose={() => setShowForm(false)} />}
      {validateIdeaId && (
        <IdeaValidationPanel
          ideaId={validateIdeaId}
          ideaTitle={validateIdeaTitle}
          onClose={() => setValidateIdeaId(null)}
        />
      )}
    </>
  );
}
