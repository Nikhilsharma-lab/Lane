import { LoginFrame } from "@/components/auth/auth-frames";
import {
  ClerkHashSignIn,
  ClerkSessionTasks,
} from "@/components/auth/clerk-sign-in";
import { LoginResetLink } from "@/components/auth/login-reset-link";
import { HiddenDuringSessionTask } from "@/components/auth/session-task-gate";

// A server component, so the frame and its links render on the server and only
// Clerk's card and the session check ship as client code.
export default function LoginPage() {
  return (
    <LoginFrame headerAction={<HiddenDuringSessionTask><LoginResetLink /></HiddenDuringSessionTask>}>
      <ClerkSessionTasks fallback={<ClerkHashSignIn />} />
    </LoginFrame>
  );
}
