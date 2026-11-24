import Link from "@/components/link";
import { signInReturningTo } from "@/lib/auth-return-address";

/** The way back in when the session ended: sign in, then return to Intake. `onLeave` saves the draft first. */
export function SignInAgain({ onLeave }: { onLeave: () => void }) {
  return <Link href={signInReturningTo("/intake")} onClick={onLeave} className="font-medium text-foreground underline underline-offset-4">Sign in again</Link>;
}
