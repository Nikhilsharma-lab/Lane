"use client";
// PROTOTYPE (#344). Password sign-in with Turnstile. The form is usable at once;
// the Turnstile token is awaited only on submit. Marks timings on window.
import { useEffect, useRef, useState } from "react";
import { createAuthClient } from "better-auth/react";

const authClient = createAuthClient();
const SITEKEY = "1x00000000000000000000AA"; // Cloudflare's always-pass test key
declare global { interface Window { turnstile?: any; __proto?: Record<string, number> } }

export default function Login() {
  const token = useRef<Promise<string> | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    (window.__proto ??= {}).formUsable = performance.now();
    let resolve!: (t: string) => void;
    token.current = new Promise((r) => (resolve = r));
    const s = document.createElement("script");
    s.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
    s.async = true;
    s.onload = () => {
      window.__proto!.turnstileScript = performance.now();
      window.turnstile.render("#ts", { sitekey: SITEKEY, appearance: "interaction-only", callback: (t: string) => { window.__proto!.turnstileToken = performance.now(); resolve(t); } });
    };
    document.head.appendChild(s);
  }, []);
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    window.__proto!.submit = performance.now();
    setBusy(true);
    const f = new FormData(e.currentTarget);
    const captcha = await token.current!;
    window.__proto!.tokenAwaited = performance.now();
    const { error } = await authClient.signIn.email(
      { email: String(f.get("email")), password: String(f.get("password")) },
      { headers: { "x-captcha-response": captcha } },
    );
    window.__proto!.signInResponse = performance.now();
    if (error) { setError(error.message ?? "Sign-in failed"); setBusy(false); return; }
    location.assign("/app");
  }
  return (
    <form onSubmit={submit} style={{ display: "grid", gap: 8, maxWidth: 320 }}>
      <h1>Sign in</h1>
      <input name="email" type="email" placeholder="Email" required />
      <input name="password" type="password" placeholder="Password" required />
      <div id="ts" />
      <button disabled={busy}>Sign in</button>
      {error && <p role="alert">{error}</p>}
    </form>
  );
}
