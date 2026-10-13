"use client";

import { CircleAlert } from "lucide-react";
import { Button } from "@/components/arc/button/button";
import { EmptyState } from "@/components/arc/empty-state/empty-state";
import { PageStrip } from "@/components/shell/page-strip";

// Plan item 2.0: the frame keeps the page strip, so the shell's trail and the
// expand control stay in place; the alert covers only the message.
export default function AppError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex min-h-full flex-col">
      <PageStrip title="Page unavailable" heading />
      <div className="flex flex-1 flex-col p-6" role="alert">
        <EmptyState
          className="my-auto"
          title="This page couldn’t load"
          description="Try again. If the error continues, reload the page."
          icon={<CircleAlert aria-hidden="true" />}
          action={
            <>
              <Button variant="secondary" onClick={reset}>Try again</Button>
              <Button variant="ghost" onClick={() => window.location.reload()}>Reload</Button>
            </>
          }
        />
      </div>
    </div>
  );
}
