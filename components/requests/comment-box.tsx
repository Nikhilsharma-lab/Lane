"use client";

import { useRef, useState, useTransition } from "react";
import { addComment } from "@/app/actions/requests";

export function CommentBox({ requestId }: { requestId: string }) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const ref = useRef<HTMLTextAreaElement>(null);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const body = ref.current?.value ?? "";
    if (!body.trim()) return;

    setError(null);
    startTransition(async () => {
      const result = await addComment(requestId, body);
      if (result?.error) {
        setError(result.error);
      } else {
        if (ref.current) ref.current.value = "";
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-2 mt-4">
      <textarea
        ref={ref}
        rows={3}
        placeholder="Add a comment or check-in update..."
        className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2.5 text-sm text-zinc-300 placeholder-zinc-700 focus:outline-none focus:border-zinc-600 resize-none"
      />
      <div className="flex items-center justify-between">
        {error ? <p className="text-xs text-red-400">{error}</p> : <span />}
        <button
          type="submit"
          disabled={isPending}
          className="text-xs bg-zinc-800 hover:bg-zinc-700 text-zinc-300 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-40"
        >
          {isPending ? "Posting..." : "Post"}
        </button>
      </div>
    </form>
  );
}
