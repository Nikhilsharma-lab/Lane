"use client";
// PROTOTYPE (#346), throwaway. Every send, check and save below is a stub; nothing leaves the browser.
//
// Demo rules, so every state can be reached by typing:
//   email containing "new"  → no Lane account uses it      email containing "fail" → the code can't be sent
//   email containing "taken" → sign-up: account exists     password "wrong"        → password doesn't match
//   password "password1"    → found in a breach            code 000000 → wrong · 111111 → expired · anything else works

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { CheckIcon, LockKeyholeIcon, MonitorIcon, ShieldCheckIcon, SmartphoneIcon } from "lucide-react";

import { AuthHeaderLink, AuthShell, AuthTrust } from "@/components/auth/auth-shell";
import { AuthFormCard } from "@/components/auth/auth-form-card";
import { AuthInputField, AuthPasswordField } from "@/components/auth/auth-field";
import { AuthAction } from "@/components/auth/auth-action";
import { RoleSelection, type FunctionalRole } from "@/components/auth/role-selection";
import { Alert } from "@/components/arc/alert/alert";
import { Badge } from "@/components/arc/badge/badge";
import { Button } from "@/components/arc/button/button";
import { Checkbox } from "@/components/arc/checkbox/checkbox";
import { Dialog, DialogContent } from "@/components/arc/dialog/dialog";
import { Input } from "@/components/arc/input/input";
import { OtpInput } from "@/components/arc/otp-input/otp-input";
import { SettingsBlock, SettingsGroup, SettingsRow, SettingsRowList } from "@/components/settings/settings-group";
import settings from "@/components/settings/settings.module.css";
import s from "./prototype.module.css";

/* ───────────────────────────── screens, states, variants ───────────────────────────── */

const VARIANTS = {
  A: "One page, password first",
  B: "Email first, then how",
  C: "Code first",
} as const;
type Variant = keyof typeof VARIANTS;

const SCREENS: Record<string, { label: string; states: string[]; variants?: boolean }> = {
  login: { label: "/login", variants: true, states: ["start", "wrong-password", "code-sent", "code-wrong", "code-expired", "unknown-email", "send-failed", "rate-limited", "google-failed", "signed-in"] },
  signup: { label: "/signup", variants: true, states: ["start", "account-exists", "breached-password", "code-sent", "code-wrong", "send-failed", "verified"] },
  forgot: { label: "/forgot-password", states: ["start", "unknown-email", "send-failed", "rate-limited"] },
  reset: { label: "/reset-password", states: ["code", "code-wrong", "code-expired", "breached-password", "saved"] },
  invite: { label: "/invite/[id]", states: ["signed-out-has-account", "signed-out-new", "signed-in-match", "signed-in-other", "expired", "already-accepted", "cancelled", "workspace-full", "joined"] },
  onboarding: { label: "/onboarding", states: ["invitations", "no-invitations", "after-removal", "role"] },
  account: { label: "Settings → Profile (account)", states: ["password-and-google", "google-only", "password-only", "change-password", "set-password"] },
  workspace: { label: "Settings → workspace", states: ["admin", "admin-remove", "last-admin", "member", "member-leave"] },
};

const href = (screen: string, variant: string, state?: string) => `/prototype/auth?screen=${screen}&variant=${variant}${state ? `&state=${state}` : ""}`;

const Report = createContext<(state: unknown) => void>(() => {});
/** Every screen reports its full state, shown top right. */
function useReport(state: unknown) {
  const report = useContext(Report);
  const json = JSON.stringify(state);
  useEffect(() => { report(JSON.parse(json)); }, [json, report]);
}

export function AuthPrototype({ screen, state, variant }: { screen: string; state?: string; variant: string }) {
  const def = SCREENS[screen] ?? SCREENS.login;
  const v = (variant in VARIANTS ? variant : "A") as Variant;
  const initial = state && def.states.includes(state) ? state : def.states[0];
  const [readout, setReadout] = useState<unknown>(null);
  const key = `${screen}-${v}-${initial}`;
  return <Report.Provider value={setReadout}>
    {screen === "signup" ? <SignForm key={key} mode="signup" variant={v} initial={initial} />
      : screen === "forgot" ? <Forgot key={key} initial={initial} />
      : screen === "reset" ? <Reset key={key} initial={initial} />
      : screen === "invite" ? <Invite key={key} initial={initial} variant={v} />
      : screen === "onboarding" ? <Onboarding key={key} initial={initial} variant={v} />
      : screen === "account" ? <Account key={key} initial={initial} />
      : screen === "workspace" ? <Workspace key={key} initial={initial} />
      : <SignForm key={key} mode="login" variant={v} initial={initial} />}
    <details className={s.readout}><summary>state</summary>{JSON.stringify(readout, null, 2)}</details>
    <Switcher screen={SCREENS[screen] ? screen : "login"} state={initial} variant={v} />
  </Report.Provider>;
}

function Switcher({ screen, state, variant }: { screen: string; state: string; variant: Variant }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const def = SCREENS[screen];
  const keys = Object.keys(VARIANTS) as Variant[];
  const go = (next: Record<string, string | undefined>) => {
    const q = new URLSearchParams(params.toString());
    for (const [k, value] of Object.entries(next)) { if (value) q.set(k, value); else q.delete(k); }
    router.replace(`${pathname}?${q.toString()}`, { scroll: false });
  };
  const cycle = (step: number) => {
    if (def.variants) go({ variant: keys[(keys.indexOf(variant) + step + keys.length) % keys.length], state: undefined });
    else go({ state: def.states[(def.states.indexOf(state) + step + def.states.length) % def.states.length] });
  };
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (target.closest("input, textarea, select, [contenteditable]")) return;
      if (event.key === "ArrowLeft") cycle(-1);
      if (event.key === "ArrowRight") cycle(1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });
  if (process.env.NODE_ENV === "production") return null;
  return <div className={s.bar} role="toolbar" aria-label="Prototype switcher">
    <select aria-label="Screen" value={screen} onChange={e => go({ screen: e.target.value, state: undefined })}>
      {Object.entries(SCREENS).map(([k, d]) => <option key={k} value={k}>{d.label}</option>)}
    </select>
    {def.variants && <>
      <button type="button" aria-label="Previous variant" onClick={() => cycle(-1)}>←</button>
      <span className={s.barLabel}>{variant} ({VARIANTS[variant]})</span>
      <button type="button" aria-label="Next variant" onClick={() => cycle(1)}>→</button>
    </>}
    <select aria-label="Jump to state" value={state} onChange={e => go({ state: e.target.value })}>
      {def.states.map(k => <option key={k} value={k}>{k}</option>)}
    </select>
    {!def.variants && <span className={s.barLabel}>← → cycle states</span>}
  </div>;
}

/* ───────────────────────────── shared pieces ───────────────────────────── */

const ERR = {
  wrongPassword: "That email and password don’t match. Try again, or email yourself a code.",
  unknownEmail: "No Lane account uses this email.",
  sendFailed: "We couldn’t send the code right now. Sign in with your password or Google, or try again later.",
  sendFailedSignup: "We couldn’t send the code right now. Try again in a few minutes.",
  codeWrong: "That code isn’t right. Check the most recent email from Lane.",
  codeExpired: "That code has expired. Send a new one.",
  rateLimited: "Too many tries. Wait a minute, then try again.",
  googleFailed: "Google sign-in didn’t finish. Try again, or use your email.",
  exists: "A Lane account already uses this email.",
  breached: "This password has appeared in a data breach elsewhere. Choose a different one.",
  short: "Use at least 8 characters.",
};

function GoogleMark() {
  return <svg className={s.google} viewBox="0 0 24 24" aria-hidden="true"><path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.4h6.5a5.6 5.6 0 0 1-2.4 3.6v3h3.9c2.2-2.1 3.5-5.1 3.5-8.7Z"/><path fill="#34A853" d="M12 24c3.2 0 6-1.1 7.9-2.9l-3.9-3c-1 .7-2.4 1.2-4 1.2-3.1 0-5.7-2.1-6.6-4.9h-4v3.1A12 12 0 0 0 12 24Z"/><path fill="#FBBC05" d="M5.4 14.4a7.2 7.2 0 0 1 0-4.7V6.6h-4a12 12 0 0 0 0 10.8l4-3Z"/><path fill="#EA4335" d="M12 4.8c1.7 0 3.3.6 4.6 1.8l3.4-3.4A12 12 0 0 0 1.4 6.6l4 3.1c.9-2.8 3.5-4.9 6.6-4.9Z"/></svg>;
}

function GoogleButton({ onClick, label = "Continue with Google" }: { onClick: () => void; label?: string }) {
  return <AuthAction type="button" kind="secondary" onClick={onClick}><GoogleMark />{label}</AuthAction>;
}

const Or = () => <div className={s.divider} role="separator">or</div>;

/** A stand-in for Cloudflare Turnstile's managed widget; it passes on its own after a moment. */
function Turnstile() {
  const [done, setDone] = useState(false);
  useEffect(() => { const t = setTimeout(() => setDone(true), 700); return () => clearTimeout(t); }, []);
  return <div className={s.turnstile} aria-label="Cloudflare Turnstile (placeholder)">
    <span className={s.turnstileBox}>{done && <CheckIcon size={14} aria-hidden="true" />}</span>
    <span>{done ? "Success!" : "Verifying…"}</span>
    <span className={s.turnstileBrand}>CLOUDFLARE<br />Privacy · Terms</span>
  </div>;
}

function useCountdown(start: number) {
  const [left, setLeft] = useState(start);
  useEffect(() => { if (left <= 0) return; const t = setTimeout(() => setLeft(left - 1), 1000); return () => clearTimeout(t); }, [left]);
  return [left, setLeft] as const;
}

/** The code step every variant shares: six slots, Resend after 30 s, Change email. */
function CodeStep({ email, code, setCode, error, onSubmit, onResend, onChangeEmail, purpose }: {
  email: string; code: string; setCode: (c: string) => void; error?: string; onSubmit: () => void; onResend: () => void; onChangeEmail: () => void; purpose: "sign-in" | "verify";
}) {
  const [left, setLeft] = useCountdown(30);
  return <form className={s.stack} noValidate onSubmit={e => { e.preventDefault(); onSubmit(); }}>
    <OtpInput label={purpose === "verify" ? "Confirmation code" : "Sign-in code"} value={code} autoFocus error={error}
      description="The code works for 10 minutes." onChange={next => { setCode(next); }} />
    <AuthAction type="submit" disabled={code.length < 6}>{purpose === "verify" ? "Confirm email" : "Sign in"}</AuthAction>
    <div className={s.row}>
      <AuthAction type="button" kind="tertiary" aria-disabled={left > 0 || undefined} onClick={() => { if (left === 0) { onResend(); setLeft(30); } }}>
        {left > 0 ? `Send a new code in ${left}s` : "Send a new code"}
      </AuthAction>
      <AuthAction type="button" kind="tertiary" onClick={onChangeEmail}>Use a different email</AuthAction>
    </div>
    <p className={s.small}>Sent to {email}. Check spam if it isn’t there within a minute.</p>
  </form>;
}

function SignedIn({ title, line }: { title: string; line: string }) {
  return <AuthFormCard title={title} description={line}><Alert tone="success" title="Opening Acme Design…">Lane opens the workspace you used last.</Alert></AuthFormCard>;
}

/* ───────────────────────────── /login and /signup: one form, three variants ───────────────────────────── */

type Step = "start" | "method" | "code" | "details" | "done";
type Form = { step: Step; method: "password" | "code"; email: string; name: string; password: string; code: string; error?: string; field?: "email" | "password" | "code" | "name"; turnstile: boolean };

/** What each prototype state starts as. */
function initialForm(mode: "login" | "signup", variant: Variant, state: string): Form {
  const base: Form = { step: "start", method: variant === "C" && mode === "login" ? "code" : "password", email: "", name: "", password: "", code: "", turnstile: false };
  const typed = { ...base, email: "sam@acme.com", name: "Sam Lee" };
  const methodStep: Step = variant === "B" ? "method" : "start";
  switch (state) {
    case "wrong-password": return { ...typed, step: methodStep, method: "password", password: "wrong", error: ERR.wrongPassword, field: "password" };
    case "code-sent": return { ...typed, step: "code", method: "code" };
    case "code-wrong": return { ...typed, step: "code", method: "code", code: "000000", error: ERR.codeWrong, field: "code" };
    case "code-expired": return { ...typed, step: "code", method: "code", code: "111111", error: ERR.codeExpired, field: "code" };
    case "unknown-email": return { ...typed, email: "sam@newco.com", step: variant === "B" ? "start" : "start", method: "code", error: ERR.unknownEmail, field: "email" };
    case "send-failed": return { ...typed, email: "sam@fail.com", step: mode === "signup" ? (variant === "B" ? "details" : "start") : variant === "B" ? "method" : "start", method: "code", error: mode === "signup" ? ERR.sendFailedSignup : ERR.sendFailed };
    case "rate-limited": return { ...typed, step: methodStep, error: ERR.rateLimited };
    case "google-failed": return { ...base, error: ERR.googleFailed };
    case "signed-in": case "verified": return { ...typed, step: "done" };
    case "account-exists": return { ...typed, email: "sam@taken.com", step: variant === "B" ? "start" : "start", error: ERR.exists, field: "email" };
    case "breached-password": return { ...typed, step: variant === "B" ? "details" : "start", password: "password1", error: ERR.breached, field: "password" };
    default: return base;
  }
}

function SignForm({ mode, variant, initial }: { mode: "login" | "signup"; variant: Variant; initial: string }) {
  const [f, setF] = useState<Form>(() => initialForm(mode, variant, initial));
  useReport({ screen: mode, variant, ...f, password: f.password ? "•".repeat(f.password.length) : "" });
  const set = (patch: Partial<Form>) => setF(cur => ({ ...cur, error: undefined, field: undefined, ...patch }));
  const fail = (error: string, field?: Form["field"]) => setF(cur => ({ ...cur, error, field }));
  const login = mode === "login";
  const other = login ? "signup" : "login";

  // Stubs for Better Auth's browser calls.
  const sendCode = () => {
    if (login && f.email.includes("new")) return fail(ERR.unknownEmail, "email");
    if (f.email.includes("fail")) return fail(login ? ERR.sendFailed : ERR.sendFailedSignup);
    set({ step: "code", method: "code", code: "" });
  };
  const signInPassword = () => {
    if (!f.email.includes("@")) return fail("Enter your email address.", "email");
    if (!f.password) return fail("Enter your password.", "password");
    if (f.password === "wrong") return fail(ERR.wrongPassword, "password");
    set({ step: "done" });
  };
  const signUp = () => {
    if (!f.name.trim()) return fail("Enter your name.", "name");
    if (!f.email.includes("@")) return fail("Enter your email address.", "email");
    if (f.email.includes("taken")) return fail(ERR.exists, "email");
    if (f.password.length < 8) return fail(ERR.short, "password");
    if (f.password === "password1") return fail(ERR.breached, "password");
    sendCode();
  };
  const checkCode = () => {
    if (f.code === "000000") return fail(ERR.codeWrong, "code");
    if (f.code === "111111") return fail(ERR.codeExpired, "code");
    set({ step: "done" });
  };
  const google = () => set({ step: "done" });

  const header = login ? <AuthHeaderLink prompt="New to Lane?" href={href("signup", variant)} label="Create an account" />
    : <AuthHeaderLink prompt="Have an account?" href={href("login", variant)} label="Sign in" />;
  const errorAlert = f.error && !f.field ? <Alert tone="danger" title={f.error} /> : null;
  const unknownAlert = f.field === "email" && f.error === ERR.unknownEmail
    ? <Alert tone="danger" title={ERR.unknownEmail}><a className={s.textLink} href={href("signup", variant)}>Sign up instead</a></Alert>
    : f.field === "email" && f.error === ERR.exists
      ? <Alert tone="danger" title={ERR.exists}><a className={s.textLink} href={href("login", variant)}>Sign in instead</a></Alert> : null;
  const emailError = f.field === "email" && !unknownAlert ? f.error : undefined;

  const emailField = <AuthInputField id="email" label="Email address" type="email" autoComplete="email" value={f.email} error={emailError}
    onChange={e => set({ email: e.target.value })} autoFocus />;
  const passwordField = <AuthPasswordField id="password" label={login ? "Password" : "Choose a password"} autoComplete={login ? "current-password" : "new-password"}
    description={login ? undefined : "At least 8 characters."} value={f.password} error={f.field === "password" ? f.error : undefined}
    onChange={e => set({ password: e.target.value })}
    trailing={login ? <a className={s.textLink} href={href("forgot", variant)}>Forgot password?</a> : undefined} />;
  const nameField = <AuthInputField id="name" label="Your name" autoComplete="name" value={f.name} error={f.field === "name" ? f.error : undefined}
    onChange={e => set({ name: e.target.value })} />;
  const emailChip = <div className={s.emailChip}><span>{f.email}</span><button type="button" className={s.textLink} onClick={() => set({ step: "start", password: "", code: "" })}>Change</button></div>;

  const footer = <AuthTrust icon={ShieldCheckIcon} className="justify-center sm:justify-start">
    {login ? "Lane opens the workspace you used last." : "Create or join a workspace after confirming your email."}
  </AuthTrust>;

  const shell = (title: string, description: ReactNode, body: ReactNode) =>
    <AuthShell headerAction={header} footer={footer}><AuthFormCard title={title} description={description}>{body}</AuthFormCard></AuthShell>;

  if (f.step === "done") return <AuthShell headerAction={header}>{login
    ? <SignedIn title="You’re signed in" line={`Signed in as ${f.email || "sam@gmail.com"}.`} />
    : <AuthFormCard title="Email confirmed" description="Next, create a workspace or join one you’ve been invited to."><AuthAction type="button" onClick={() => { window.location.href = href("onboarding", variant, "invitations"); }}>Continue</AuthAction></AuthFormCard>}</AuthShell>;

  if (f.step === "code") return shell(login ? "Check your email" : "Confirm your email",
    login ? `Enter the 6-digit code we sent to ${f.email}.` : `Enter the 6-digit code we sent to ${f.email} to finish creating your account.`,
    <div className={s.stack}>
      <CodeStep email={f.email} code={f.code} setCode={code => set({ code })} error={f.field === "code" ? f.error : undefined}
        onSubmit={checkCode} onResend={() => set({ code: "" })} onChangeEmail={() => set({ step: "start", code: "" })} purpose={login ? "sign-in" : "verify"} />
      {errorAlert}
    </div>);

  /* ── Variant A: one page. Google, or, every field at once. The code is a link away (Turnstile shows only then). ── */
  if (variant === "A" || (variant === "C" && !login)) {
    if (login && f.method === "code") return shell("Sign in with a code", "We’ll email you a 6-digit code. No password needed.",
      <form className={s.stack} noValidate onSubmit={e => { e.preventDefault(); sendCode(); }}>
        {emailField}{unknownAlert}<Turnstile />{errorAlert}
        <AuthAction type="submit">Email me a code</AuthAction>
        <button type="button" className={s.textLink} onClick={() => set({ method: "password" })}>Use your password instead</button>
      </form>);
    return shell(login ? "Sign in to Lane" : "Create your Lane account", login ? "Welcome back." : "Free during the pilot. You’ll confirm your email with a code.",
      <div className={s.stack}>
        <GoogleButton onClick={google} />
        <Or />
        <form className={s.stack} noValidate onSubmit={e => { e.preventDefault(); if (login) signInPassword(); else signUp(); }}>
          {!login && nameField}{emailField}{unknownAlert}{passwordField}
          {!login && <Turnstile />}
          {errorAlert}
          <AuthAction type="submit">{login ? "Sign in" : "Create account"}</AuthAction>
        </form>
        {login && <button type="button" className={s.textLink} onClick={() => set({ method: "code" })}>Email me a sign-in code instead</button>}
        {variant === "C" && <p className={s.small}>Prototype note: sign-up is the same as A in every variant, because a code never creates an account (Q16).</p>}
      </div>);
  }

  /* ── Variant B: email first. One field and Continue; the next step asks how. ── */
  if (variant === "B") {
    if (f.step === "start") return shell(login ? "Sign in to Lane" : "Create your Lane account", login ? "Start with your email." : "Free during the pilot. Start with your email.",
      <div className={s.stack}>
        <form className={s.stack} noValidate onSubmit={e => {
          e.preventDefault();
          if (!f.email.includes("@")) return fail("Enter your email address.", "email");
          if (login && f.email.includes("new")) return fail(ERR.unknownEmail, "email");
          if (!login && f.email.includes("taken")) return fail(ERR.exists, "email");
          set({ step: login ? "method" : "details" });
        }}>
          {emailField}{unknownAlert}{errorAlert}
          <AuthAction type="submit">Continue</AuthAction>
        </form>
        <Or />
        <GoogleButton onClick={google} />
      </div>);
    if (login) return shell("Welcome back", "Sign in with your password, or we’ll email you a code.",
      <div className={s.stack}>
        {emailChip}
        <form className={s.stack} noValidate onSubmit={e => { e.preventDefault(); signInPassword(); }}>
          {passwordField}{f.field !== "password" && f.error !== ERR.sendFailed && errorAlert}
          <AuthAction type="submit">Sign in</AuthAction>
        </form>
        <Or />
        {f.method === "code" ? <div className={s.stack}><Turnstile />{f.error === ERR.sendFailed && errorAlert}<AuthAction type="button" kind="secondary" onClick={sendCode}>Email me a code</AuthAction></div>
          : <AuthAction type="button" kind="secondary" onClick={() => set({ method: "code" })}>Email me a code instead</AuthAction>}
      </div>);
    return shell("Create your Lane account", "Tell us your name and choose a password.",
      <form className={s.stack} noValidate onSubmit={e => { e.preventDefault(); signUp(); }}>
        {emailChip}{nameField}{passwordField}<Turnstile />{errorAlert}
        <AuthAction type="submit">Create account</AuthAction>
      </form>);
  }

  /* ── Variant C (login only): code first, as Arc's sign-in block. Password is the alternative. ── */
  return shell("Sign in to Lane", f.method === "code" ? "We’ll email you a 6-digit code." : "Sign in with your password.",
    <div className={s.stack}>
      <GoogleButton onClick={google} />
      <Or />
      {f.method === "code"
        ? <form className={s.stack} noValidate onSubmit={e => { e.preventDefault(); sendCode(); }}>
            {emailField}{unknownAlert}<Turnstile />{errorAlert}
            <AuthAction type="submit">Email me a code</AuthAction>
            <button type="button" className={s.textLink} onClick={() => set({ method: "password" })}>Sign in with a password</button>
          </form>
        : <form className={s.stack} noValidate onSubmit={e => { e.preventDefault(); signInPassword(); }}>
            {emailField}{passwordField}{errorAlert}
            <AuthAction type="submit">Sign in</AuthAction>
            <button type="button" className={s.textLink} onClick={() => set({ method: "code" })}>Email me a code instead</button>
          </form>}
    </div>);
}

/* ───────────────────────────── /forgot-password and /reset-password ───────────────────────────── */

function recoveryShell(body: ReactNode) {
  return <AuthShell headerAction={<AuthHeaderLink prompt="Remembered it?" href={href("login", "A")} label="Sign in" />}
    footer={<AuthTrust icon={LockKeyholeIcon} className="justify-center sm:justify-start">Saving a new password signs you out on your other devices.</AuthTrust>}>{body}</AuthShell>;
}

function Forgot({ initial }: { initial: string }) {
  const [email, setEmail] = useState(initial === "start" ? "" : initial === "unknown-email" ? "sam@newco.com" : initial === "send-failed" ? "sam@fail.com" : "sam@acme.com");
  const [error, setError] = useState<string | undefined>(initial === "unknown-email" ? ERR.unknownEmail : initial === "send-failed" ? "We couldn’t send the code right now. Try again in a few minutes." : initial === "rate-limited" ? ERR.rateLimited : undefined);
  useReport({ screen: "forgot", email, error });
  const send = () => {
    if (!email.includes("@")) return setError("Enter your email address.");
    if (email.includes("new")) return setError(ERR.unknownEmail);
    if (email.includes("fail")) return setError("We couldn’t send the code right now. Try again in a few minutes.");
    window.location.href = href("reset", "A", "code");
  };
  return recoveryShell(<AuthFormCard title="Forgot your password?" description="Enter the email you use for Lane. We’ll email you a code to reset it.">
    <form className={s.stack} noValidate onSubmit={e => { e.preventDefault(); send(); }}>
      <AuthInputField id="recovery-email" label="Email address" type="email" autoComplete="email" value={email} autoFocus
        error={error === "Enter your email address." ? error : undefined} onChange={e => { setEmail(e.target.value); setError(undefined); }} />
      {error === ERR.unknownEmail && <Alert tone="danger" title={ERR.unknownEmail}><a className={s.textLink} href={href("signup", "A")}>Sign up instead</a></Alert>}
      <Turnstile />
      {error && error !== ERR.unknownEmail && error !== "Enter your email address." && <Alert tone="danger" title={error} />}
      <AuthAction type="submit">Send reset code</AuthAction>
    </form>
  </AuthFormCard>);
}

function Reset({ initial }: { initial: string }) {
  const [code, setCode] = useState(initial === "code-wrong" ? "000000" : initial === "code-expired" ? "111111" : initial === "breached-password" ? "482913" : "");
  const [password, setPassword] = useState(initial === "breached-password" ? "password1" : "");
  const [error, setError] = useState<{ field?: "code" | "password"; text: string } | undefined>(
    initial === "code-wrong" ? { field: "code", text: ERR.codeWrong } : initial === "code-expired" ? { field: "code", text: ERR.codeExpired }
      : initial === "breached-password" ? { field: "password", text: ERR.breached } : undefined);
  const [saved, setSaved] = useState(initial === "saved");
  useReport({ screen: "reset", code, password: "•".repeat(password.length), error, saved });
  const [left, setLeft] = useCountdown(initial === "code" ? 30 : 0);
  if (saved) return recoveryShell(<SignedIn title="Password saved" line="You’re signed in here, and signed out on your other devices." />);
  return recoveryShell(<AuthFormCard title="Reset your password" description="Enter the code we sent to sam@acme.com and choose a new password.">
    <form className={s.stack} noValidate onSubmit={e => {
      e.preventDefault();
      if (code === "000000") return setError({ field: "code", text: ERR.codeWrong });
      if (code === "111111") return setError({ field: "code", text: ERR.codeExpired });
      if (password.length < 8) return setError({ field: "password", text: ERR.short });
      if (password === "password1") return setError({ field: "password", text: ERR.breached });
      setSaved(true);
    }}>
      <OtpInput label="Reset code" value={code} autoFocus error={error?.field === "code" ? error.text : undefined} onChange={next => { setCode(next); setError(undefined); }} />
      <AuthPasswordField id="recovery-password" label="New password" autoComplete="new-password" description="At least 8 characters." value={password}
        error={error?.field === "password" ? error.text : undefined} onChange={e => { setPassword(e.target.value); setError(undefined); }} />
      <AuthAction type="submit">Save new password</AuthAction>
      <div className={s.row}>
        <AuthAction type="button" kind="tertiary" aria-disabled={left > 0 || undefined} onClick={() => { if (left === 0) { setLeft(30); setCode(""); setError(undefined); } }}>
          {left > 0 ? `Send a new code in ${left}s` : "Send a new code"}
        </AuthAction>
        <AuthAction type="button" kind="tertiary" onClick={() => { window.location.href = href("forgot", "A"); }}>Use a different email</AuthAction>
      </div>
    </form>
  </AuthFormCard>);
}

/* ───────────────────────────── /invite/[id] ───────────────────────────── */

function Invite({ initial, variant }: { initial: string; variant: Variant }) {
  const [state, setState] = useState(initial);
  useReport({ screen: "invite", state, invitation: { workspace: "Acme Design", invitedBy: "Priya Shah", email: "sam@acme.com", role: "Member", expires: "27 Nov 2026" } });
  const card = <div className={s.inviteCard}><strong>Acme Design</strong><p className={s.muted}>Priya Shah invited sam@acme.com to join as a Member.</p></div>;
  const shell = (title: string, description: ReactNode, body: ReactNode) => <AuthShell><AuthFormCard title={title} description={description}><div className={s.stack}>{body}</div></AuthFormCard></AuthShell>;
  const go = (screen: string, st?: string) => () => { window.location.href = href(screen, variant, st); };
  switch (state) {
    case "signed-out-has-account": return shell("Join Acme Design", "Sign in as sam@acme.com to accept.", <>
      {card}<AuthAction type="button" onClick={go("login")}>Sign in to accept</AuthAction>
      <p className={s.small}>After you sign in, you come back here to accept.</p></>);
    case "signed-out-new": return shell("Join Acme Design", "Create a Lane account with sam@acme.com to accept.", <>
      {card}<AuthAction type="button" onClick={go("signup")}>Create an account</AuthAction>
      <AuthAction type="button" kind="tertiary" onClick={go("login")}>I already have an account</AuthAction></>);
    case "signed-in-match": return shell("Join Acme Design", "You’re signed in as sam@acme.com.", <>
      {card}<AuthAction type="button" onClick={() => setState("joined")}>Accept and join</AuthAction>
      <AuthAction type="button" kind="tertiary" onClick={() => setState("cancelled")}>Decline</AuthAction></>);
    case "signed-in-other": return shell("This invitation is for someone else", <>It was sent to <strong>sam@acme.com</strong>, and you’re signed in as <strong>sam.lee@gmail.com</strong>.</>, <>
      {card}<AuthAction type="button" onClick={go("login")}>Sign out and sign in as sam@acme.com</AuthAction>
      <AuthAction type="button" kind="tertiary" onClick={go("onboarding", "no-invitations")}>Stay signed in as sam.lee@gmail.com</AuthAction></>);
    case "expired": return shell("This invitation has expired", "Invitations last 7 days. Ask an Admin of Acme Design to send it again.", <>
      <AuthAction type="button" kind="secondary" onClick={go("login")}>Go to Lane</AuthAction></>);
    case "already-accepted": return shell("You’re already in Acme Design", "This invitation has been accepted.", <>
      <AuthAction type="button" onClick={go("login", "signed-in")}>Open Acme Design</AuthAction></>);
    case "cancelled": return shell("This invitation can’t be used", "It was cancelled or declined. Ask an Admin of Acme Design for a new one.", <>
      <AuthAction type="button" kind="secondary" onClick={go("login")}>Go to Lane</AuthAction></>);
    case "workspace-full": return shell("Acme Design is full", "A workspace holds up to 100 people. Ask an Admin of Acme Design to make room, then open this link again.", <>
      {card}<AuthAction type="button" kind="secondary" onClick={() => setState("signed-in-match")}>Try again</AuthAction></>);
    default: return <Onboarding initial="role" variant={variant} joined="Acme Design" />;
  }
}

/* ───────────────────────────── /onboarding ───────────────────────────── */

function Onboarding({ initial, joined }: { initial: string; variant: Variant; joined?: string }) {
  const [state, setState] = useState(initial);
  const [name, setName] = useState("");
  const [nameError, setNameError] = useState<string>();
  const [role, setRole] = useState<FunctionalRole | null>(null);
  const [workspace, setWorkspace] = useState(joined);
  useReport({ screen: "onboarding", state, name, role, workspace });
  const signOut = <button type="button" className={s.textLink} onClick={() => { window.location.href = href("login", "A"); }}>Sign out</button>;
  const create = <form className={s.stack} noValidate onSubmit={e => {
    e.preventDefault();
    if (!name.trim()) return setNameError("Name your workspace.");
    setWorkspace(name.trim()); setState("role");
  }}>
    <AuthInputField id="workspace-name" label="Workspace name" placeholder="Your team or company" value={name} error={nameError} onChange={e => { setName(e.target.value); setNameError(undefined); }} />
    <AuthAction type="submit" kind={state === "invitations" ? "secondary" : "primary"}>Create workspace</AuthAction>
  </form>;
  if (state === "role") return <AuthShell headerAction={signOut}><AuthFormCard title="Choose your role" description={`${workspace ?? "Acme Design"} is ready. Your role is a label; it changes nothing you can see or do.`}>
    <form className={s.stack} onSubmit={e => { e.preventDefault(); if (role) setState("done"); }}>
      <RoleSelection value={role} onValueChange={setRole} />
      <AuthAction type="submit" disabled={!role}>Continue to Requests</AuthAction>
    </form></AuthFormCard></AuthShell>;
  if (state === "done") return <AuthShell><SignedIn title="All set" line="Opening Requests." /></AuthShell>;
  return <AuthShell headerAction={signOut}><AuthFormCard
    title={state === "invitations" ? "Join your team" : "Create your workspace"}
    description={state === "invitations" ? "You’ve been invited to these workspaces as sam@acme.com." : "A workspace is where your team’s Requests live. You can invite people next."}>
    <div className={s.stack}>
      {state === "after-removal" && <Alert tone="info" title="You’re no longer in Acme Design">An Admin removed you. Your Requests and comments stay in that workspace.</Alert>}
      {state === "invitations" && <ul className={s.inviteList}>
        {[{ w: "Acme Design", by: "Priya Shah", role: "Member" }, { w: "Northwind Product", by: "Ola Berg", role: "Guest" }].map(i =>
          <li key={i.w} className={s.inviteRow}><div><strong>{i.w}</strong><span className={s.small}>{i.by} invited you as a {i.role}</span></div>
            <Button size="sm" onClick={() => { setWorkspace(i.w); setState("role"); }}>Join</Button></li>)}
      </ul>}
      {state === "invitations" ? <><Or /><p className={s.muted}>Or start a workspace of your own.</p>{create}</> : create}
      {state !== "invitations" && <p className={s.small}>Expecting an invitation? Ask an Admin to invite sam@acme.com. It shows up here.</p>}
    </div>
  </AuthFormCard></AuthShell>;
}

/* ───────────────────────────── Settings → Profile, account ───────────────────────────── */

function SettingsPage({ title, purpose, children }: { title: string; purpose: string; children: ReactNode }) {
  return <div className={s.settingsFrame}>
    <div className={s.settingsTop}>Settings</div>
    <div className={settings.page}><section className={settings.section}>
      <header className={settings.sectionHead}><h2>{title}</h2><p>{purpose}</p></header>
      {children}
    </section></div>
  </div>;
}

function Account({ initial }: { initial: string }) {
  const startMethods = initial === "google-only" || initial === "set-password" ? { password: false, google: true } : initial === "password-only" ? { password: true, google: false } : { password: true, google: true };
  const [methods, setMethods] = useState(startMethods);
  const [name, setName] = useState("Sam Lee");
  const [savedName, setSavedName] = useState("Sam Lee");
  const [dialog, setDialog] = useState<"password" | null>(initial === "change-password" || initial === "set-password" ? "password" : null);
  const [signOutOthers, setSignOutOthers] = useState(true);
  const [pw, setPw] = useState({ current: "", next: "" });
  const [pwError, setPwError] = useState<string>();
  const [devices, setDevices] = useState([
    { id: "1", icon: MonitorIcon, label: "Chrome on macOS", detail: "This device", current: true },
    { id: "2", icon: SmartphoneIcon, label: "Safari on iPhone", detail: "Used today · signed in 18 Nov", current: false },
    { id: "3", icon: MonitorIcon, label: "Firefox on Windows", detail: "Used 12 Nov · signed in 2 Nov", current: false },
  ]);
  useReport({ screen: "account", methods, name, savedName, dialog, signOutOthers, devices: devices.map(d => d.label) });
  const onlyOne = Number(methods.password) + Number(methods.google) === 1;
  return <SettingsPage title="Profile" purpose="Your name, how you sign in, and where you’re signed in.">
    <SettingsGroup label="Account" labelId="acct">
      <SettingsRow label="Name" hint="Shown on your Requests and comments." control={
        <form className={s.inlineForm} onSubmit={e => { e.preventDefault(); setSavedName(name); }}>
          <Input label="Name" hideLabel value={name} onChange={e => setName(e.target.value)} />
          <Button size="sm" variant="secondary" type="submit" disabled={name === savedName || !name.trim()}>Save</Button>
        </form>} />
      <SettingsRow label="Email" hint="Changing your email isn’t available yet. Ask Lane support if you need to." control={<span>sam@acme.com</span>} />
    </SettingsGroup>
    <SettingsGroup label="Sign-in methods" labelId="methods" description="Keep at least one way to sign in. You can always get a sign-in code by email.">
      <SettingsRow label="Password" hint={methods.password ? "Changing it can sign you out on your other devices." : "You sign in with Google. Add a password to sign in without it."}
        control={<Button size="sm" variant="secondary" onClick={() => { setPwError(undefined); setPw({ current: "", next: "" }); setDialog("password"); }}>{methods.password ? "Change password" : "Set a password"}</Button>} />
      <SettingsRow label="Google" hint={methods.google ? (onlyOne ? "Google is your only sign-in method. Set a password before disconnecting it." : "Connected as sam@acme.com.") : "Sign in with your Google account for sam@acme.com."}
        control={methods.google
          ? <Button size="sm" variant="secondary" disabled={onlyOne} onClick={() => setMethods(m => ({ ...m, google: false }))}>Disconnect</Button>
          : <Button size="sm" variant="secondary" onClick={() => setMethods(m => ({ ...m, google: true }))}><GoogleMark />Connect Google</Button>} />
    </SettingsGroup>
    <SettingsGroup label={`Signed-in devices (${devices.length})`} labelId="devices" description="Only you see this. A device stays signed in for 7 days after it was last used.">
      <SettingsRowList label="Signed-in devices">
        {devices.map(d => <SettingsRow as="li" key={d.id} leading={<d.icon aria-hidden="true" />} label={d.label}
          hint={d.current ? <Badge size="sm" tone="success">This device</Badge> : d.detail}
          control={d.current ? null : <Button size="sm" variant="ghost" onClick={() => setDevices(all => all.filter(x => x.id !== d.id))}>Sign out</Button>} />)}
      </SettingsRowList>
      {devices.length > 1 && <SettingsBlock><Button size="sm" variant="secondary" onClick={() => setDevices(all => all.filter(x => x.current))}>Sign out of all other devices</Button></SettingsBlock>}
    </SettingsGroup>
    <Dialog open={dialog === "password"} onOpenChange={open => setDialog(open ? "password" : null)}>
      <DialogContent title={methods.password ? "Change password" : "Set a password"} description={methods.password ? undefined : "Then you can sign in with sam@acme.com and this password, as well as Google."}>
        <form className={s.dialogBody} noValidate onSubmit={e => {
          e.preventDefault();
          if (methods.password && pw.current === "wrong") return setPwError("That isn’t your current password.");
          if (pw.next.length < 8) return setPwError(ERR.short);
          if (pw.next === "password1") return setPwError(ERR.breached);
          setMethods(m => ({ ...m, password: true }));
          if (signOutOthers) setDevices(all => all.filter(x => x.current));
          setDialog(null);
        }}>
          {methods.password && <AuthPasswordField id="current" label="Current password" autoComplete="current-password" value={pw.current} onChange={e => setPw(p => ({ ...p, current: e.target.value }))} />}
          <AuthPasswordField id="next" label="New password" autoComplete="new-password" description="At least 8 characters." value={pw.next}
            error={pwError} onChange={e => { setPw(p => ({ ...p, next: e.target.value })); setPwError(undefined); }} />
          {methods.password && <Checkbox label="Sign out of my other devices" checked={signOutOthers} onCheckedChange={c => setSignOutOthers(c === true)} />}
          <div className={s.dialogActions}><Button variant="ghost" type="button" onClick={() => setDialog(null)}>Cancel</Button><Button type="submit">{methods.password ? "Change password" : "Set password"}</Button></div>
        </form>
      </DialogContent>
    </Dialog>
  </SettingsPage>;
}

/* ───────────────────────────── Settings → workspace: name, remove, leave ───────────────────────────── */

function Workspace({ initial }: { initial: string }) {
  const admin = initial.startsWith("admin") || initial === "last-admin";
  const [people, setPeople] = useState([
    { id: "me", name: "Sam Lee", email: "sam@acme.com", role: "Admin" },
    ...(initial === "last-admin" ? [] : [{ id: "p", name: "Priya Shah", email: "priya@acme.com", role: "Admin" }]),
    { id: "o", name: "Ola Berg", email: "ola@acme.com", role: "Member" },
    { id: "g", name: "Jun Park", email: "jun@studio.io", role: "Guest" },
  ].map(p => (p.id === "me" && !admin ? { ...p, role: "Member" } : p)));
  const [name, setName] = useState("Acme Design");
  const [saved, setSaved] = useState("Acme Design");
  const [removing, setRemoving] = useState<string | null>(initial === "admin-remove" ? "o" : null);
  const [leaving, setLeaving] = useState(initial === "member-leave");
  const [left, setLeft] = useState(false);
  const admins = people.filter(p => p.role === "Admin").length;
  const lastAdmin = admin && admins === 1;
  useReport({ screen: "workspace", you: admin ? "Admin" : "Member", lastAdmin, name: saved, people: people.map(p => `${p.name} (${p.role})`), removing, leaving });
  if (left) return <Onboarding initial="no-invitations" variant="A" />;
  const target = people.find(p => p.id === removing);
  return <SettingsPage title="Workspace" purpose="Acme Design’s name and the people in it.">
    <SettingsGroup label="General" labelId="general">
      <SettingsRow label="Workspace name" hint={admin ? "Everyone in the workspace sees it." : "Only Admins can change it."} control={admin
        ? <form className={s.inlineForm} onSubmit={e => { e.preventDefault(); setSaved(name.trim()); }}>
            <Input label="Workspace name" hideLabel value={name} onChange={e => setName(e.target.value)} />
            <Button size="sm" variant="secondary" type="submit" disabled={!name.trim() || name.trim() === saved}>Save</Button>
          </form>
        : <span>{saved}</span>} />
    </SettingsGroup>
    <SettingsGroup id="people" tabIndex={-1} label={`People (${people.length})`} labelId="people" description="Prototype: the real list, invitations and role changes stay as accepted in #322; only Remove is new.">
      <SettingsRowList label="People">
        {people.map(p => <SettingsRow as="li" key={p.id} label={p.id === "me" ? `${p.name} (you)` : p.name} hint={p.email}
          control={<><Badge size="sm">{p.role}</Badge>{admin && p.id !== "me" && <Button size="sm" variant="ghost" onClick={() => setRemoving(p.id)}>Remove</Button>}</>} />)}
      </SettingsRowList>
    </SettingsGroup>
    <SettingsGroup label="Leave" labelId="leave">
      <SettingsRow label="Leave Acme Design" hint={lastAdmin ? <>You’re the only Admin. Make someone else an Admin before you leave. <button type="button" className={s.textLink} onClick={() => { const el = document.getElementById("people"); el?.scrollIntoView({ block: "start" }); el?.focus(); }}>Make someone an Admin</button></> : "You lose access straight away. Your Requests and comments stay."}
        control={<Button size="sm" variant="danger" disabled={lastAdmin} onClick={() => setLeaving(true)}>Leave workspace</Button>} />
    </SettingsGroup>
    <Dialog open={!!target} onOpenChange={open => { if (!open) setRemoving(null); }}>
      {target && <DialogContent title={`Remove ${target.name}?`} description={`${target.name} loses access to Acme Design straight away. Their Requests, comments and history stay.`}>
        <div className={s.dialogActions}><Button variant="ghost" onClick={() => setRemoving(null)}>Cancel</Button>
          <Button variant="danger" onClick={() => { setPeople(all => all.filter(x => x.id !== target.id)); setRemoving(null); }}>Remove {target.name.split(" ")[0]}</Button></div>
      </DialogContent>}
    </Dialog>
    <Dialog open={leaving} onOpenChange={setLeaving}>
      <DialogContent title="Leave Acme Design?" description="You lose access straight away. Your Requests and comments stay. An Admin can invite you again.">
        <div className={s.dialogActions}><Button variant="ghost" onClick={() => setLeaving(false)}>Cancel</Button><Button variant="danger" onClick={() => { setLeaving(false); setLeft(true); }}>Leave workspace</Button></div>
      </DialogContent>
    </Dialog>
  </SettingsPage>;
}
