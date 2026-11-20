// PROTOTYPE (#344). Runs Better Auth's real Google callback with only Google's
// token endpoint faked, to see whether Lane can keep Google's picture out.
// Env: PROTO_SCHEMA=full|lean, PROTO_GOOGLE_IMAGE=undefined|null|keep.
import { sql } from "../lib/db";
import { Browser, report, short } from "./client";

const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");
const email = `g-${process.env.PROTO_SCHEMA}-${process.env.PROTO_GOOGLE_IMAGE}@example.test`;
const idToken = [b64({ alg: "RS256", kid: "proto", typ: "JWT" }), b64({
  iss: "https://accounts.google.com", aud: "prototype-344.apps.googleusercontent.com", sub: "1093344000000000000",
  email, email_verified: true, name: "Gia Google", picture: "https://lh3.googleusercontent.com/a/proto-photo",
  iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 3600,
}), "c2ln"].join(".");

const realFetch = globalThis.fetch;
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  if (url.startsWith("https://oauth2.googleapis.com/token"))
    return new Response(JSON.stringify({ access_token: "ya29.proto", expires_in: 3599, token_type: "Bearer", scope: "openid email profile", id_token: idToken }), { headers: { "content-type": "application/json" } });
  return realFetch(input, init);
}) as typeof fetch;

const label = `schema=${process.env.PROTO_SCHEMA ?? "full"}, mapProfileToUser image=${process.env.PROTO_GOOGLE_IMAGE ?? "undefined"}, image hook ${process.env.PROTO_IMAGE_HOOK ?? "off"}`;
try {
  const g = new Browser("google", `192.0.2.${Math.floor(Math.random() * 200) + 1}`);
  const start = await g.call("/sign-in/social", { provider: "google", callbackURL: "/app" });
  const state = new URL(start.body.url).searchParams.get("state");
  const cb = await g.call(`/callback/google?code=proto-code&state=${state}`);
  const ok = cb.status === 302 && !cb.body?.location?.includes("error");
  const cols = (await sql`select column_name from information_schema.columns where table_name = 'profiles'`).map((r) => r.column_name);
  const [row] = await sql`select * from profiles where email = ${email}`;
  const session = await g.call("/get-session");
  report(ok && row ? "MEASURED" : "FINDING", `[${label}] Google sign-in ${ok && row ? "succeeds" : "fails"}`,
    `callback ${cb.status} → ${cb.body?.location}; profiles.image column ${cols.includes("image") ? `present, value ${JSON.stringify(row?.image)}` : "absent"}; session user.image ${JSON.stringify(session.body?.user?.image)}`);
  const upd = await g.call("/update-user", { image: "https://example.test/self-set-photo.png" });
  const [after] = await sql`select ${sql(cols.includes("image") ? "image" : "email")} as v from profiles where email = ${email}`;
  report(cols.includes("image") && after?.v ? "FINDING" : "MEASURED", `[${label}] The person sets their own picture with /update-user`,
    `${short(upd).slice(0, 80)}; stored image: ${cols.includes("image") ? JSON.stringify(after?.v) : "no column"}`);
} catch (e) {
  report("FINDING", `[${label}] Better Auth refuses to run`, String((e as Error).message).split("\n").slice(0, 6).join(" | "));
}
await sql.end();
