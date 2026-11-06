import Link from "@/components/link";
import { Compass } from "lucide-react";
import { EmptyState } from "@/components/arc/empty-state/empty-state";
import buttonStyles from "@/components/arc/button/button.module.css";
import { LaneMark } from "@/components/brand/lane-mark";
import frame from "./app-frame.module.css";

// #271 (A119): the root not-found for anyone without a workspace to show. The signed-in one, inside the app frame,
// is src/components/shell/missing-in-frame.tsx.
const buttonLink = `${buttonStyles.button} ${buttonStyles.secondary} ${buttonStyles.md}`;

/**
 * The Lane mark above the message, and no sidebar. Signed out, Sign in. Signed in without a workspace (onboarding
 * not finished, or none chosen), Go to Lane: "/" takes them on from where they stopped.
 */
export function MissingPageNoWorkspace({ signedIn }: { signedIn: boolean }) {
  return <main className={frame.page}>
    <div className={frame.body}>
      <LaneMark className={frame.mark} />
      <EmptyState
        title="This page doesn’t exist"
        description={signedIn ? "Check the address, or go to Lane." : "Check the address, or sign in to Lane."}
        icon={<Compass aria-hidden="true" />}
        action={signedIn ? <Link href="/" className={buttonLink}>Go to Lane</Link> : <Link href="/login" className={buttonLink}>Sign in</Link>}
      />
    </div>
  </main>;
}
