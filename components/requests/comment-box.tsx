"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";

export function CommentBox({ requestId }: { requestId: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const ref = useRef<HTMLTextAreaElement>(null);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const body = ref.current?.value ?? "";
    if (!body.trim()) return;

    setError(null);
    startTransition(async () => {
      const res = await fetch(`/api/requests/${requestId}/comment`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body }),
      });
      const data = await res.json();
      if (data.error) {
        setError(data.error);
      } else {
        if (ref.current) ref.current.value = "";
        router.refresh();
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-2 mt-4">
      <Textarea
        ref={ref}
        rows={3}
        placeholder="Add a comment or check-in update..."
        className="w-full bg-muted resize-none"
      />
      <div className="flex items-center justify-between">
        {error ? <p className="text-xs text-accent-danger">{error}</p> : <span />}
        <Button
          type="submit"
          variant="secondary"
          size="sm"
          disabled={isPending}
        >
          {isPending ? "Posting..." : "Post"}
        </Button>
      </div>
    </form>
  );
}
