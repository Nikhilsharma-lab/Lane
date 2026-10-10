import Link from "next/link";
import { Compass } from "lucide-react";
import { EmptyState } from "@/components/arc/empty-state/empty-state";
import buttonStyles from "@/components/arc/button/button.module.css";

// Root not-found (plan item 1.12). It renders inside the root layout, so the theme and
// fonts are in place but the app sidebar is not; the link takes people back to Requests.
export default function NotFound() {
  return (
    <main className="flex min-h-dvh flex-1 flex-col bg-background px-4 py-6 font-sans text-foreground sm:px-6">
      <div className="my-auto">
        <h1 className="sr-only">Page not found</h1>
        <EmptyState
          title="This page doesn’t exist"
          description="Check the address, or go back to your Requests."
          icon={<Compass aria-hidden="true" />}
          action={<Link href="/" className={`${buttonStyles.button} ${buttonStyles.secondary} ${buttonStyles.md}`}>Go to Requests</Link>}
        />
      </div>
    </main>
  );
}
