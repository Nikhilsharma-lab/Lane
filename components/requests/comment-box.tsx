"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

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
      <textarea
        ref={ref}
        rows={3}
        placeholder="Add a comment or check-in update..."
        className="w-full bg-muted border border rounded-lg px-3 py-2.5 text-sm text-foreground placeholder-muted-foreground/60 focus:outline-none focus:border-border/80 resize-none"
      />
      <div className="flex items-center justify-between">
        {error ? <p className="text-xs text-red-400">{error}</p> : <span />}
        <button
          type="submit"
          disabled={isPending}
          className="text-xs bg-accent hover:bg-accent/80 text-foreground px-3 py-1.5 rounded-lg transition-colors disabled:opacity-40"
        >
          {isPending ? "Posting..." : "Post"}
        </button>
      </div>
    </form>
  );
}
