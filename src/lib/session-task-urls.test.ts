import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { SIGN_IN_URL, SIGN_UP_URL } from "./auth-return-address";

// Clerk's browser provider reads the two pages from the one place Lane names them, until it goes.
describe("sign-in and sign-up pages", () => {
  it("are Lane's /login and /signup", () => {
    expect(SIGN_IN_URL).toBe("/login");
    expect(SIGN_UP_URL).toBe("/signup");
  });

  it("are what the browser's ClerkProvider is given", () => {
    const layout = readFileSync(join(process.cwd(), "src/app/layout.tsx"), "utf8");
    expect(layout).toContain("signInUrl={SIGN_IN_URL}");
    expect(layout).toContain("signUpUrl={SIGN_UP_URL}");
    expect(layout).not.toMatch(/["']\/(?:login|signup)["']/);
  });
});
