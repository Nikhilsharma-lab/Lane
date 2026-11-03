"use client";

import { callAction } from "@/lib/action-call";
import { thrownMessage } from "@/lib/failure-messages";
import { useEffect, useId, useRef, useState, type TextareaHTMLAttributes } from "react";
import { Button } from "@/components/arc/button/button";
import { Alert } from "@/components/arc/alert/alert";
import { KeyCap } from "@/components/keyboard/key-caps";
import { usePlatform } from "@/components/arc/shortcut-recorder/shortcut-recorder";
import { CommentThreadAvatar } from "@/components/arc/comment-thread/comment-thread";
import threadStyles from "@/components/arc/comment-thread/comment-thread.module.css";
import { useToastStack } from "@/components/arc/toast-stack/toast-stack";
import { useOptionalDetailRequest } from "@/components/requests/detail-context";
import { useDetailSession } from "@/components/requests/list-view-state";
import { usePendingMutationWriter } from "@/components/requests/pending-mutations-provider";
import { addComment } from "./actions";
import styles from "./comment-form.module.css";

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
  const fieldId = useId();
  const platform = usePlatform();
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
    } catch (thrown) {
      fail(thrownMessage(thrown, "Couldn’t post your comment. Your draft is still here. Try again."));
    } finally {
      submissionLock.current = false;
    }
  }

  const fieldProps: TextareaHTMLAttributes<HTMLTextAreaElement> = {
    "aria-label": "Comment",
    "aria-invalid": Boolean(error) || undefined,
    "aria-describedby": error ? "comment-posting-shortcut comment-posting-error" : "comment-posting-shortcut",
    id: fieldId,
    autoComplete: "off",
    name: "body",
    placeholder: "Add a comment…",
    rows: 1,
    required: true,
    maxLength: 5000,
    value: body,
    onChange(event) {
      setBody(event.target.value);
      keepDraft(event.target.value);
      if (submissionState === "error" || submissionState === "success") {
        setSubmissionState("idle");
        setError(null);
      }
    },
    onKeyDown(event) {
      if (event.key === "Enter" && (event.metaKey || event.ctrlKey) && !event.nativeEvent.isComposing && !submissionLock.current && !empty) {
        event.preventDefault();
        formRef.current?.requestSubmit();
      }
      if (event.key === "Escape" && !event.nativeEvent.isComposing) {
        event.preventDefault();
        event.currentTarget.blur();
        document.getElementById("conversation-heading")?.focus({ preventScroll: true });
      }
    },
  };

  return <form ref={formRef} onSubmit={handleSubmit} className={styles.form} aria-busy={pending || undefined}>
    <div className={threadStyles.composer}>
      <CommentThreadAvatar author={{ id: detail?.viewer.id ?? requestId, name: authorName }} />
      <div className={threadStyles.fieldWrap}>
        <label htmlFor={fieldId} className="sr-only">Comment</label>
        <textarea {...fieldProps} data-1p-ignore="" data-lpignore="true" className={threadStyles.field} />
      </div>
      <div className={threadStyles.composerActions}>
        <Button type="submit" size="sm" loading={pending} disabled={empty && !pending}>
          {submissionState === "error" ? "Try again" : "Post comment"}
        </Button>
      </div>
    </div>
    {error && <div id="comment-posting-error"><Alert tone="danger" title="Action failed">{error}</Alert></div>}
    <p id="comment-posting-status" className="sr-only" role="status" aria-live="polite" aria-atomic="true">
      {pending ? "Posting comment." : submissionState === "success" ? "Comment posted." : ""}
    </p>
    <span id="comment-posting-shortcut" className="sr-only">Press Command or Control plus Enter to post.</span>
    <span aria-hidden="true" className={styles.shortcut}>
      <KeyCap>{platform === "mac" ? "⌘" : "Ctrl"}</KeyCap><KeyCap>↵</KeyCap> to post
    </span>
  </form>;
}
