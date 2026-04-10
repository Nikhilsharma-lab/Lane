"use client";

import { useEffect, useState, useCallback } from "react";
import { formatDistanceToNow } from "date-fns";
import {
  getIterationComments,
  addIterationComment,
} from "@/app/actions/iterations";

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
      <p
        style={{
          fontSize: 11,
          color: "var(--text-tertiary)",
          padding: "12px 16px",
        }}
      >
        Loading comments...
      </p>
    );
  }

  return (
    <div className="px-4 py-3 space-y-3">
      {/* Comment list */}
      {topLevel.length === 0 && (
        <p style={{ fontSize: 11, color: "var(--text-tertiary)" }}>
          No comments yet. Start the conversation.
        </p>
      )}

      {topLevel.map((c) => (
        <div key={c.id}>
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  color: "var(--text-primary)",
                }}
              >
                {c.authorName ?? "Unknown"}
              </span>
              <span
                style={{
                  fontFamily: "'Geist Mono', monospace",
                  fontSize: 9,
                  color: "var(--text-tertiary)",
                }}
              >
                {formatTs(c.createdAt)}
              </span>
            </div>
            <p
              style={{
                fontSize: 12,
                color: "var(--text-secondary)",
                lineHeight: 1.5,
              }}
            >
              {c.body}
            </p>
            <button
              onClick={() => setReplyTo(replyTo === c.id ? null : c.id)}
              style={{
                fontSize: 10,
                color: "var(--text-tertiary)",
                background: "none",
                border: "none",
                cursor: "pointer",
                padding: 0,
                fontWeight: 500,
              }}
            >
              Reply
            </button>
          </div>

          {/* Replies */}
          {replies(c.id).length > 0 && (
            <div
              className="ml-3 mt-2 space-y-2"
              style={{
                borderLeft: "2px solid var(--border)",
                paddingLeft: 12,
              }}
            >
              {replies(c.id).map((r) => (
                <div key={r.id} className="space-y-0.5">
                  <div className="flex items-center gap-2">
                    <span
                      style={{
                        fontSize: 11,
                        fontWeight: 600,
                        color: "var(--text-primary)",
                      }}
                    >
                      {r.authorName ?? "Unknown"}
                    </span>
                    <span
                      style={{
                        fontFamily: "'Geist Mono', monospace",
                        fontSize: 9,
                        color: "var(--text-tertiary)",
                      }}
                    >
                      {formatTs(r.createdAt)}
                    </span>
                  </div>
                  <p
                    style={{
                      fontSize: 12,
                      color: "var(--text-secondary)",
                      lineHeight: 1.5,
                    }}
                  >
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
              className="ml-3 mt-2 flex gap-2"
              style={{
                borderLeft: "2px solid var(--border)",
                paddingLeft: 12,
              }}
            >
              <input
                type="text"
                value={replyBody}
                onChange={(e) => setReplyBody(e.target.value)}
                placeholder="Write a reply..."
                className="flex-1 rounded-md px-2.5 py-1.5"
                style={{
                  fontSize: 11,
                  background: "var(--bg-surface)",
                  border: "1px solid var(--border)",
                  color: "var(--text-primary)",
                  outline: "none",
                }}
              />
              <button
                type="submit"
                disabled={submitting || !replyBody.trim()}
                className="rounded-md px-2.5 py-1.5 transition-opacity disabled:opacity-40"
                style={{
                  fontSize: 11,
                  fontWeight: 500,
                  background: "var(--accent)",
                  color: "#fff",
                  border: "none",
                  cursor: "pointer",
                }}
              >
                Reply
              </button>
            </form>
          )}
        </div>
      ))}

      {/* New comment form */}
      <form onSubmit={handleSubmit} className="flex gap-2 pt-1">
        <input
          type="text"
          value={newBody}
          onChange={(e) => setNewBody(e.target.value)}
          placeholder="Add a comment..."
          className="flex-1 rounded-md px-2.5 py-1.5"
          style={{
            fontSize: 11,
            background: "var(--bg-surface)",
            border: "1px solid var(--border)",
            color: "var(--text-primary)",
            outline: "none",
          }}
        />
        <button
          type="submit"
          disabled={submitting || !newBody.trim()}
          className="rounded-md px-2.5 py-1.5 transition-opacity disabled:opacity-40"
          style={{
            fontSize: 11,
            fontWeight: 500,
            background: "var(--accent)",
            color: "#fff",
            border: "none",
            cursor: "pointer",
          }}
        >
          Post
        </button>
      </form>
    </div>
  );
}
