// PROTOTYPE (#344). Server-side time of one password sign-in and sign-up, with
// and without the Turnstile check (PROTO_CAPTCHA=off), in-process, local Postgres.
import { outbox } from "../lib/auth";
import { sql } from "../lib/db";
import { Browser, report } from "./client";
const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
const PASSWORD = "violet-otter-344-lane";
const mode = process.env.PROTO_CAPTCHA === "off" ? "Turnstile off" : "Turnstile on";
const ups: number[] = [], ins: number[] = [];
for (let i = 0; i < 6; i++) {
  const email = `cost-${i}-${Date.now()}@example.test`;
  const b = new Browser("cost", `192.0.2.${100 + i}`);
  const up = await b.call("/sign-up/email", { email, password: PASSWORD, name: "Cost" });
  await b.call("/email-otp/verify-email", { email, otp: [...outbox.mail].reverse().find((m) => m.to === email)!.code });
  const si = await new Browser("cost-in", `192.0.2.${150 + i}`).call("/sign-in/email", { email, password: PASSWORD });
  if (i > 0) { ups.push(up.ms); ins.push(si.ms); }
}
report("MEASURED", `${mode}: sign-up request median ${median(ups).toFixed(0)} ms (includes Have I Been Pwned), password sign-in request median ${median(ins).toFixed(0)} ms`, `runs ${ins.map((x) => x.toFixed(0)).join(", ")}`);
await sql.end();
