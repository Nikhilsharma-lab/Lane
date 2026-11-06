import Link from "@/components/link";
import { Compass } from "lucide-react";
import { EmptyState } from "@/components/arc/empty-state/empty-state";
import buttonStyles from "@/components/arc/button/button.module.css";
import { PageStrip } from "@/components/shell/page-strip";

const buttonLink = `${buttonStyles.button} ${buttonStyles.secondary} ${buttonStyles.md}`;

/** #271 (A118): a signed-in "Page not found". The strip names the place; the one heading says what happened. */
export function MissingPage() {
  return <div className="flex min-h-full flex-col">
    <PageStrip title="Page not found" />
    <div className="flex flex-1 flex-col justify-center p-6">
      <EmptyState
        title="This page doesn’t exist"
        description="Check the address, or go back to your Requests."
        icon={<Compass aria-hidden="true" />}
        action={<Link href="/" className={buttonLink}>Go to Requests</Link>}
      />
    </div>
  </div>;
}
