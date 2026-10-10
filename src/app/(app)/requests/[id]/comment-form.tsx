"use client";

import { useRef, useState } from "react";
import { LoaderCircle, Send } from "lucide-react";
import { Button } from "@/components/arc/button/button";
import { Alert } from "@/components/arc/alert/alert";
import { Textarea } from "@/components/arc/textarea/textarea";
import { addComment } from "./actions";

type SubmissionState = "idle" | "posting" | "error" | "success";

export function CommentForm({
  requestId,
  context,
}: {
  requestId: string;
  context: { orgId: string };
}) {
  const [body, setBody] = useState("");
  const [submissionState, setSubmissionState] =
    useState<SubmissionState>("idle");
  const [error, setError] = useState<string | null>(null);
  const submissionLock = useRef(false);
  const formRef = useRef<HTMLFormElement>(null);
  const pending = submissionState === "posting";
  const empty = body.trim().length === 0;

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submissionLock.current || empty) return;

    submissionLock.current = true;
    setSubmissionState("posting");
    setError(null);

    const formData = new FormData();
    formData.set("body", body);

    try {
      const result = await addComment(requestId, formData, context);

      if ("error" in result && result.error) {
        setError(result.error);
        setSubmissionState("error");
        return;
      }

      // addComment revalidated the detail path, so its response already
      // carries the new comment. A router refresh here would render twice.
      setBody("");
      setSubmissionState("success");
    } catch {
      setError(
        "Couldn’t post your comment. Your draft is still here. Try again."
      );
      setSubmissionState("error");
    } finally {
      submissionLock.current = false;
    }
  }

  return (
    <form
      ref={formRef}
      onSubmit={handleSubmit}
      className="space-y-2"
      aria-busy={pending || undefined}
    >
      <Textarea
        label="Comment"
        aria-label="Comment"
        aria-describedby="comment-posting-shortcut"
        name="body"
        placeholder="Add a comment..."
        rows={2}
        required
        maxLength={5000}
        value={body}
        readOnly={pending}
        onChange={(event) => {
          setBody(event.target.value);
          if (submissionState !== "idle") {
            setSubmissionState("idle");
            setError(null);
          }
        }}
        className="min-h-16 resize-none"
        onKeyDown={(event) => {
          if (
            event.key === "Enter" &&
            (event.metaKey || event.ctrlKey) &&
            !submissionLock.current &&
            !empty
          ) {
            event.preventDefault();
            formRef.current?.requestSubmit();
          }
        }}
      />
      {error && (
        <div id="comment-posting-error">
          <Alert tone="danger" title="Action failed">
            {error}
          </Alert>
        </div>
      )}
      <p
        id="comment-posting-status"
        className="sr-only"
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        {pending
          ? "Posting comment."
          : submissionState === "success"
            ? "Comment posted."
            : ""}
      </p>
      <div className="flex items-center justify-between gap-3">
        <span
          id="comment-posting-shortcut"
          className="sr-only"
        >
          Press Command or Control plus Enter to post.
        </span>
        <span
          aria-hidden="true"
          className="hidden text-xs text-muted-foreground sm:inline"
        >
          ⌘/Ctrl + Enter to post
        </span>
        <Button
          type="submit"
          size="sm"
          disabled={pending || empty}
          aria-busy={pending || undefined}
          className="ml-auto"
        >
          {pending ? (
            <LoaderCircle
              aria-hidden="true"
              data-icon="inline-start"
              className="motion-safe:animate-spin motion-reduce:animate-none"
            />
          ) : (
            <Send
              aria-hidden="true"
              data-icon="inline-start"
            />
          )}
          {pending
            ? "Posting…"
            : submissionState === "error"
              ? "Try again"
              : "Post comment"}
        </Button>
      </div>
    </form>
  );
}
