"use client";

import { callAction } from "@/lib/action-call";
import { useEffect, useRef, useState } from "react";
import { LoaderCircle, Send } from "lucide-react";
import { Button } from "@/components/arc/button/button";
import { Alert } from "@/components/arc/alert/alert";
import { Textarea } from "@/components/arc/textarea/textarea";
import { useToastStack } from "@/components/arc/toast-stack/toast-stack";
import { useOptionalDetailRequest } from "@/components/requests/detail-context";
import { useDetailSession } from "@/components/requests/list-view-state";
import { usePendingMutationWriter } from "@/components/requests/pending-mutations-provider";
import { addComment } from "./actions";

type SubmissionState = "idle" | "posting" | "error" | "success";

/**
 * Plan item 2.5: a posted comment shows in the conversation in the same
 * frame, through the layout-level overlay, and the box clears so the person
 * can keep writing. The post stays locked until addComment answers. On a
 * refusal or a lost response the pending comment goes and its text comes
 * back into the box, ahead of anything typed meanwhile. The draft is kept
 * per Request in the layout's memory, so J, K, Esc or Back never lose it.
 * When the post fails after the form has gone (the person left with Esc, J
 * or K while it was in flight), the text goes back into that Request's draft
 * and a toast says so, so a failed post is never silent.
 */
export function CommentForm({
  requestId,
  context,
  author,
}: {
  requestId: string;
  context: { orgId: string };
  /** The name the pending comment shows; defaults to the Request detail's viewer. */
  author?: string;
}) {
  const overlay = usePendingMutationWriter();
  const detail = useOptionalDetailRequest();
  const { commentDrafts } = useDetailSession();
  const { toast } = useToastStack();
  const authorName = author ?? detail?.viewer.name ?? "You";
  const requestName = detail?.name ?? "this Request";
  const [body, setBody] = useState(() => commentDrafts.get(requestId) ?? "");
  const [submissionState, setSubmissionState] =
    useState<SubmissionState>("idle");
  const [error, setError] = useState<string | null>(null);
  const submissionLock = useRef(false);
  const formRef = useRef<HTMLFormElement>(null);
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  const pending = submissionState === "posting";
  const empty = body.trim().length === 0;

  function keepDraft(value: string) {
    if (value) commentDrafts.set(requestId, value);
    else commentDrafts.delete(requestId);
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submissionLock.current || empty) return;

    submissionLock.current = true;
    setSubmissionState("posting");
    setError(null);

    const text = body;
    const formData = new FormData();
    formData.set("body", text);
    // Shown at once; the server trims the same way.
    const key = overlay?.appendComment(requestId, { body: text.trim(), authorName });
    setBody("");
    keepDraft("");

    // The pending comment goes and the text returns, ahead of anything typed since.
    // The layout's draft is the source: it outlives this form.
    const fail = (message: string) => {
      if (key) overlay?.dropComment(requestId, key);
      const current = commentDrafts.get(requestId) ?? "";
      const restored = current.trim() ? `${text}\n\n${current}` : text;
      keepDraft(restored);
      if (!mounted.current) {
        toast({ type: "error", title: "Couldn’t post your comment", description: `Your draft is back in the comment box on ${requestName}.` });
        return;
      }
      setBody(restored);
      setError(message);
      setSubmissionState("error");
    };

    try {
      const result = await callAction(() => addComment(requestId, formData, context));

      if ("error" in result) {
        fail(result.error);
        return;
      }

      // addComment revalidated the detail path, so its response already
      // carries the new comment. A router refresh here would render twice.
      // The pending row keeps its place under the server id until then.
      if (key && result.comment) overlay?.confirmComment(requestId, key, result.comment);
      setSubmissionState("success");
    } catch {
      fail("Couldn’t post your comment. Your draft is still here. Try again.");
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
        hideLabel
        aria-label="Comment"
        aria-describedby="comment-posting-shortcut"
        name="body"
        placeholder="Add a comment..."
        rows={2}
        required
        maxLength={5000}
        value={body}
        onChange={(event) => {
          setBody(event.target.value);
          keepDraft(event.target.value);
          // Typing while a post is in flight starts the next draft; the post keeps its lock.
          if (submissionState === "error" || submissionState === "success") {
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
          // Plan item 2.5: Esc keeps the draft and leaves the box; a second Esc returns to Requests.
          if (event.key === "Escape" && !event.nativeEvent.isComposing) {
            event.preventDefault();
            event.currentTarget.blur();
            document.getElementById("conversation-heading")?.focus({ preventScroll: true });
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
        {/* Plan item 2.5 (decision D8): the strip's action is the page's one filled button. */}
        <Button
          type="submit"
          variant="secondary"
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
