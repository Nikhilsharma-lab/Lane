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

const RESEND_COOLDOWN_MS = 30_000;

export type RecoveryField = "email" | "code" | "password";
export type RecoveryFieldErrors = Partial<Record<RecoveryField, string>>;

// The browser's own rule for type="email" (HTML's valid e-mail address), so the
// inline message accepts and refuses what its tooltip did.
const EMAIL = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;

/** D11 (#290): the step's empty and bad-format fields, said on the field instead of in the browser's tooltip. */
export function recoveryInputErrors(step: RecoveryStep, values: { email: string; code: string; password: string }): RecoveryFieldErrors {
  const errors: RecoveryFieldErrors = {};
  if (step === "request") {
    const email = values.email.trim();
    if (!email) errors.email = "Enter an email address.";
    else if (!EMAIL.test(email)) errors.email = "Enter a valid email address.";
  }
  if (step === "code") {
    if (!values.code.trim()) errors.code = "Enter the reset code.";
    if (!values.password) errors.password = "Enter a new password.";
  }
  return errors;
}

/** D16 (#290): the field a Clerk error names (its `paramName`), so the message sits on that field. */
export function recoveryErrorField(error: unknown): RecoveryField | null {
  const first = error && typeof error === "object" && "errors" in error && Array.isArray(error.errors) ? error.errors[0] : null;
  const param: unknown = first && typeof first === "object" && "meta" in first ? first.meta?.paramName : null;
  if (param === "identifier" || param === "email_address") return "email";
  if (param === "code") return "code";
  if (param === "password") return "password";
  return null;
}

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
      try {
        const result = await signIn.create({
          strategy: "reset_password_email_code",
          identifier: email.trim(),
        });
        // D12 (#290): the cooldown starts only once Clerk says a code was sent, so
        // "Couldn't find your account." or a failed request leaves Send usable at
        // once. It outlives Change email; Clerk enforces its own limits on top.
        if (result.status === "needs_first_factor") {
          step = "code";
          nextSendAt = now() + RESEND_COOLDOWN_MS;
        } else acceptResult(result);
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
