// PROTOTYPE (#344). Sign-in from a server action: does nextCookies() set the
// session cookie, and does the Turnstile check still apply on auth.api calls?
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth, TURNSTILE_DUMMY_TOKEN } from "@/lib/auth";

async function signInAction(form: FormData) {
  "use server";
  const h = new Headers(await headers());
  if (form.get("withCaptcha")) h.set("x-captcha-response", TURNSTILE_DUMMY_TOKEN);
  try {
    await auth.api.signInEmail({ body: { email: String(form.get("email")), password: String(form.get("password")) }, headers: h });
  } catch (e) {
    redirect(`/login-action?error=${encodeURIComponent((e as Error).message)}`);
  }
  redirect("/app");
}

export default async function Page({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  return (
    <form action={signInAction} style={{ display: "grid", gap: 8, maxWidth: 320 }}>
      <h1>Sign in (server action)</h1>
      <input name="email" type="email" required />
      <input name="password" type="password" required />
      <label><input type="checkbox" name="withCaptcha" /> send a Turnstile token</label>
      <button>Sign in</button>
      {error && <p role="alert" id="error">{error}</p>}
    </form>
  );
}
