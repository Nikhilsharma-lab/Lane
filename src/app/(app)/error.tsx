"use client";

import { Button } from "@/components/ui/button";
import { Typography } from "@/components/ui/typography";

export default function AppError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 py-12">
      <Typography as="h2" role="sectionTitle">Something went wrong</Typography>
      <Typography as="p" role="ui" className="text-muted-foreground">
        An error occurred while loading this page.
      </Typography>
      <Button variant="outline" size="sm" onClick={reset}>
        Try again
      </Button>
    </div>
  );
}
