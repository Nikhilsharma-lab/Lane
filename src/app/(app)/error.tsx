"use client";

import { useEffect } from "react";
import { CircleAlert } from "lucide-react";
import { Button } from "@/components/arc/button/button";
import { EmptyState } from "@/components/arc/empty-state/empty-state";
import { PageStrip } from "@/components/shell/page-strip";
import { reportClientError } from "@/lib/report-client-error";
import { SupportContact } from "../support-contact";

// Plan item 2.0: the frame keeps the page strip, so the shell's trail and the
// expand control stay in place; the alert covers only the message.
// #271 (A120): like the other error screens, it says how to get help and reports what went wrong.
export default function AppError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    console.error("Lane could not render the page", { digest: error.digest, message: error.message });
    void reportClientError(error, { boundary: "page", digest: error.digest });
  }, [error]);

  return (
    <div className="flex min-h-full flex-col">
      <PageStrip title="Page unavailable" heading />
      <div className="flex flex-1 flex-col justify-center p-6" role="alert">
        <EmptyState
          title="This page couldn’t load"
          description="Try again. If the error continues, reload the page."
          icon={<CircleAlert aria-hidden="true" />}
          action={
            <>
              <Button variant="secondary" onClick={retry}>Try again</Button>
              <Button variant="ghost" onClick={() => window.location.reload()}>Reload</Button>
            </>
          }
        />
        <SupportContact />
      </div>
    </div>
  );
}
