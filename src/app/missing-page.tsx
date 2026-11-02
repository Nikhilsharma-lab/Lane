import Link from "@/components/link";
import { Compass } from "lucide-react";
import { EmptyState } from "@/components/arc/empty-state/empty-state";
import buttonStyles from "@/components/arc/button/button.module.css";
import { LaneGlyph } from "@/components/brand/lane-glyph";
import frame from "./app-frame.module.css";

// #271 (A119): the root not-found for anyone without a workspace to show. The signed-in one, inside the app frame,
// is src/components/shell/missing-in-frame.tsx.
const buttonLink = `${buttonStyles.button} ${buttonStyles.secondary} ${buttonStyles.md}`;

/** The Lane mark above the message, and Sign in. */
export function MissingPageSignedOut() {
  return <main className={frame.page}>
    <div className={frame.body}>
      <span className={frame.mark} data-lane-mark=""><LaneGlyph /><span>Lane</span></span>
      <EmptyState
        title="This page doesn’t exist"
        description="Check the address, or sign in to Lane."
        icon={<Compass aria-hidden="true" />}
        action={<Link href="/login" className={buttonLink}>Sign in</Link>}
      />
    </div>
  </main>;
}
