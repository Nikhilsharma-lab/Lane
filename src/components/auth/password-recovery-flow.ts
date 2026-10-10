type RecoveryResult = { status: string | null; createdSessionId: string | null };
type RecoverySignIn = {
  create: (params: { strategy: "reset_password_email_code"; identifier: string }) => Promise<RecoveryResult>;
  attemptFirstFactor: (params: { strategy: "reset_password_email_code"; code: string; password: string }) => Promise<RecoveryResult>;
};
type RecoveryNavigation = {
  session: { currentTask?: { key: string } | null } | null;
  decorateUrl: (path: string) => string;
};
type ActivateSession = (params: { session: string; navigate: (context: RecoveryNavigation) => Promise<void> }) => Promise<void>;

type RecoveryStep = "request" | "code" | "activate" | "continue";

// These are the existing hash-routed Clerk SignIn screens at /login. Additional
// factors stay inside Clerk rather than being reimplemented or skipped here.
function clerkContinuation(status: string | null) {
  switch (status) {
    case "needs_first_factor": return "/login#/factor-one";
    case "needs_second_factor": return "/login#/factor-two";
    case "needs_client_trust": return "/login#/client-trust";
    case "needs_new_password": return "/login#/reset-password";
    case "needs_protect_check": return "/login#/protect-check";
    default: return "/login";
  }
}

/** Transient form state only. Never retain a password or reset code. */
export function createPasswordRecoveryFlow(now = Date.now) {
  let step: RecoveryStep = "request";
  let sessionId: string | null = null;
  let continuationUrl: string | null = null;
  let nextSendAt = 0;
  let busy = false;

  function acceptResult(result: RecoveryResult) {
    if (result.status === "complete" && result.createdSessionId) {
      sessionId = result.createdSessionId;
      step = "activate";
      return;
    }
    step = "continue";
    continuationUrl = clerkContinuation(result.status);
  }

  return {
    snapshot: () => ({ step, nextSendAt, continuationUrl }),
    changeEmail() {
      if (busy || (step !== "request" && step !== "code")) return false;
      step = "request";
      return true;
    },
    async sendCode(signIn: RecoverySignIn, email: string) {
      if (busy || now() < nextSendAt || (step !== "request" && step !== "code")) return false;
      busy = true;
      // An uncertain network failure may still have sent an email. Keep the
      // cooldown on failures and identity changes; Clerk enforces server limits.
      nextSendAt = now() + 30_000;
      try {
        const result = await signIn.create({
          strategy: "reset_password_email_code",
          identifier: email.trim(),
        });
        if (result.status === "needs_first_factor") step = "code";
        else acceptResult(result);
        return true;
      } finally {
        busy = false;
      }
    },
    async verify(signIn: RecoverySignIn, credentials: { code: string; password: string }) {
      if (busy || step !== "code") return false;
      busy = true;
      try {
        const result = await signIn.attemptFirstFactor({
          strategy: "reset_password_email_code",
          ...credentials,
        });
        acceptResult(result);
        return true;
      } finally {
        busy = false;
      }
    },
    async finish(activate: ActivateSession, navigate: (url: string) => void | Promise<void>) {
      if (busy || step !== "activate" || !sessionId) return false;
      busy = true;
      try {
        await activate({
          session: sessionId,
          navigate: async ({ session, decorateUrl }) => {
            await navigate(decorateUrl(session?.currentTask ? "/login#/tasks" : "/"));
          },
        });
        return true;
      } finally {
        // If activation fails, retry it without consuming the reset code again.
        busy = false;
      }
    },
  };
}
