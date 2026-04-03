"use client";

import { useEffect } from "react";
import Link from "next/link";

export default function RequestError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[RequestDetail] Error:", error.message, error.digest, error.stack);
  }, [error]);

  return (
    <div className="min-h-screen bg-[var(--bg-base)] text-[var(--text-primary)] flex items-center justify-center">
      <div className="text-center max-w-md px-6">
        <p className="text-[var(--text-secondary)] text-sm mb-1">Something went wrong loading this request.</p>
        {error.digest && (
          <p className="text-[var(--text-tertiary)] text-xs mb-6 font-mono">Digest: {error.digest}</p>
        )}
        <div className="flex items-center justify-center gap-3">
          <button
            onClick={reset}
            className="text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] border border-[var(--border)] hover:border-[var(--border-strong)] rounded-lg px-4 py-2 transition-colors"
          >
            Try again
          </button>
          <Link
            href="/dashboard"
            className="text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
          >
            Back to requests
          </Link>
        </div>
      </div>
    </div>
  );
}
