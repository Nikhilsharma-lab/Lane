"use client";

import { useEffect } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

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
    <div className="min-h-screen bg-background text-foreground flex items-center justify-center">
      <div className="text-center max-w-md px-6">
        <p className="text-muted-foreground text-sm mb-1">Something went wrong loading this request.</p>
        {error.digest && (
          <p className="text-muted-foreground/60 text-xs mb-6 font-mono">Digest: {error.digest}</p>
        )}
        <div className="flex items-center justify-center gap-3">
          <Button variant="outline" size="lg" onClick={reset}>
            Try again
          </Button>
          <Link
            href="/dashboard"
            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            Back to requests
          </Link>
        </div>
      </div>
    </div>
  );
}
