"use client";

import { CircleAlert } from "lucide-react";
import { usePathname } from "next/navigation";
import { Button } from "@/components/arc/button/button";
import { EmptyState } from "@/components/arc/empty-state/empty-state";
import { SidebarExpandButton } from "@/components/shell/sidebar-controls";

export default function AppError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const pathname = usePathname();
  return (
    <div className="flex min-h-full flex-col p-6" role="alert">
      {pathname === "/" && <div><SidebarExpandButton /></div>}
      <h1 className="sr-only">Page unavailable</h1>
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
  );
}
