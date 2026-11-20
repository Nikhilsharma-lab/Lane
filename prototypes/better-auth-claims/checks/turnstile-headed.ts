// PROTOTYPE (#344). Same login timing as browser-walk.ts, in a visible (headed)
// Chromium window, to rule out a headless-only Turnstile delay.
import { chromium } from "playwright";
const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
const browser = await chromium.launch({ headless: false });
const tokens: number[] = [];
for (let i = 0; i < 5; i++) {
  const ctx = await browser.newContext();
  const p = await ctx.newPage();
  await p.goto("http://localhost:3344/login");
  await p.waitForFunction(() => (window as any).__proto?.turnstileToken, null, { timeout: 20000 });
  tokens.push(await p.evaluate(() => Math.round((window as any).__proto.turnstileToken)));
  await ctx.close();
}
console.log(`MEASURED  headed Chromium, first visit: Turnstile token ready median ${median(tokens)} ms (runs ${tokens.join(", ")})`);
await browser.close();
