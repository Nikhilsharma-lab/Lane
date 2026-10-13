import Link from "next/link";
import { Compass } from "lucide-react";
import { EmptyState } from "@/components/arc/empty-state/empty-state";
import buttonStyles from "@/components/arc/button/button.module.css";
import { PageStrip } from "@/components/shell/page-strip";
import frame from "./app-frame.module.css";

// Root not-found (plan item 1.12). It renders inside the root layout, so the theme and
// fonts are in place but the app sidebar is not; the link takes people back to Requests.
export default function NotFound() {
  return (
    <main className={frame.page}>
      <PageStrip title="Page not found" heading />
      <div className={frame.body}>
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
