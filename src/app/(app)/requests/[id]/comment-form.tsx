"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Feedback } from "@/components/ui/feedback";
import { Textarea } from "@/components/ui/textarea";
import { addComment } from "./actions";

export function CommentForm({
  requestId,
  context,
}: {
  requestId: string;
  context: { orgId: string };
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const router = useRouter();

  async function handleSubmit(formData: FormData) {
    setPending(true);
    setError(null);
    const result = await addComment(requestId, formData, context);
    setPending(false);
    if ("error" in result && result.error) {
      setError(result.error);
    } else {
      formRef.current?.reset();
      router.refresh();
    }
  }

  return (
    <form ref={formRef} action={handleSubmit} className="space-y-2">
      <Textarea
        aria-label="Comment"
        name="body"
        placeholder="Add a comment..."
        rows={2}
        required
        disabled={pending}
        className="min-h-16 resize-none"
        onKeyDown={(event) => {
          if (
            event.key === "Enter" &&
            (event.metaKey || event.ctrlKey) &&
            !pending
          ) {
            event.preventDefault();
            formRef.current?.requestSubmit();
          }
        }}
      />
      {error && (
        <Feedback kind="error" variant="inline">
          {error}
        </Feedback>
      )}
      <div className="flex items-center justify-between gap-3">
        <span className="hidden text-type-micro text-muted-foreground sm:inline">
          ⌘/Ctrl + Enter to post
        </span>
        <Button
          type="submit"
          size="sm"
          disabled={pending}
          aria-busy={pending}
          className="ml-auto"
        >
          <Send
            aria-hidden="true"
            data-icon="inline-start"
            strokeWidth={1.8}
          />
          {pending ? "Posting…" : "Post comment"}
        </Button>
      </div>
    </form>
  );
}
