"use client";

import { useEffect, useState, useCallback } from "react";
import { formatDistanceToNow } from "date-fns";
import {
  getIterationComments,
  addIterationComment,
} from "@/app/actions/iterations";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface CommentData {
  id: string;
  iterationId: string;
  authorId: string;
  parentId: string | null;
  body: string;
  createdAt: Date | string;
  authorName: string | null;
}

export function IterationComments({
  iterationId,
}: {
  iterationId: string;
}) {
  const [comments, setComments] = useState<CommentData[]>([]);
  const [loading, setLoading] = useState(true);
  const [newBody, setNewBody] = useState("");
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [replyBody, setReplyBody] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const fetchComments = useCallback(async () => {
    try {
      const data = await getIterationComments(iterationId);
      setComments(data as CommentData[]);
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }, [iterationId]);

  useEffect(() => {
    fetchComments();
  }, [fetchComments]);

  const topLevel = comments.filter((c) => !c.parentId);
  const replies = (parentId: string) =>
    comments.filter((c) => c.parentId === parentId);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!newBody.trim() || submitting) return;
    setSubmitting(true);
    await addIterationComment({ iterationId, body: newBody.trim() });
    setNewBody("");
    setSubmitting(false);
    fetchComments();
  }

  async function handleReply(e: React.FormEvent) {
    e.preventDefault();
    if (!replyBody.trim() || !replyTo || submitting) return;
    setSubmitting(true);
    await addIterationComment({
      iterationId,
      body: replyBody.trim(),
      parentId: replyTo,
    });
    setReplyBody("");
    setReplyTo(null);
    setSubmitting(false);
    fetchComments();
  }

  function formatTs(d: Date | string) {
    const date = d instanceof Date ? d : new Date(d);
    return formatDistanceToNow(date, { addSuffix: true });
  }

  if (loading) {
    return (
      <p className="px-4 py-3 text-[11px] text-muted-foreground/60">
        Loading comments...
      </p>
    );
  }

  return (
    <div className="space-y-3 px-4 py-3">
      {/* Comment list */}
      {topLevel.length === 0 && (
        <p className="text-[11px] text-muted-foreground/60">
          No comments yet. Start the conversation.
        </p>
      )}

      {topLevel.map((c) => (
        <div key={c.id}>
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-semibold text-foreground">
                {c.authorName ?? "Unknown"}
              </span>
              <span className="font-mono text-[9px] text-muted-foreground/60">
                {formatTs(c.createdAt)}
              </span>
            </div>
            <p className="text-xs leading-relaxed text-muted-foreground">
              {c.body}
            </p>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setReplyTo(replyTo === c.id ? null : c.id)}
              className="h-auto p-0 text-[10px] font-medium text-muted-foreground/60"
            >
              Reply
            </Button>
          </div>

          {/* Replies */}
          {replies(c.id).length > 0 && (
            <div className="ml-3 mt-2 space-y-2 border-l-2 border-border pl-3">
              {replies(c.id).map((r) => (
                <div key={r.id} className="space-y-0.5">
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-semibold text-foreground">
                      {r.authorName ?? "Unknown"}
                    </span>
                    <span className="font-mono text-[9px] text-muted-foreground/60">
                      {formatTs(r.createdAt)}
                    </span>
                  </div>
                  <p className="text-xs leading-relaxed text-muted-foreground">
                    {r.body}
                  </p>
                </div>
              ))}
            </div>
          )}

          {/* Inline reply form */}
          {replyTo === c.id && (
            <form
              onSubmit={handleReply}
              className="ml-3 mt-2 flex gap-2 border-l-2 border-border pl-3"
            >
              <Input
                type="text"
                value={replyBody}
                onChange={(e) => setReplyBody(e.target.value)}
                placeholder="Write a reply..."
                className="flex-1 text-[11px]"
              />
              <Button
                type="submit"
                size="sm"
                disabled={submitting || !replyBody.trim()}
              >
                Reply
              </Button>
            </form>
          )}
        </div>
      ))}

      {/* New comment form */}
      <form onSubmit={handleSubmit} className="flex gap-2 pt-1">
        <Input
          type="text"
          value={newBody}
          onChange={(e) => setNewBody(e.target.value)}
          placeholder="Add a comment..."
          className="flex-1 text-[11px]"
        />
        <Button
          type="submit"
          size="sm"
          disabled={submitting || !newBody.trim()}
        >
          Post
        </Button>
      </form>
    </div>
  );
}
