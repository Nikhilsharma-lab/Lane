import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const RECOVERY_HOOK = join(
  process.cwd(),
  "src/components/ui/use-recoverable-action.ts"
);

const FIRST_RUN_ACTION_SOURCES = [
  "src/app/(auth)/login/page.tsx",
  "src/app/(auth)/signup/signup-form.tsx",
  "src/app/(auth)/signup/check-email/check-email.tsx",
  "src/app/(auth)/invite/[token]/accept-button.tsx",
  "src/app/(auth)/onboarding/onboarding-form.tsx",
] as const;

function readSource(path: (typeof FIRST_RUN_ACTION_SOURCES)[number]) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

describe("First-run action recovery contract", () => {
  it("locks before React rerenders and releases pending state in finally", () => {
    const source = readFileSync(RECOVERY_HOOK, "utf8");

    expect(source).toContain("const activeRef = useRef(false)");
    expect(source).toContain("if (activeRef.current)");
    expect(source).toContain('status: "blocked"');
    expect(source).toContain("activeRef.current = true");
    expect(source).toContain("setPending(true)");
    expect(source).toContain("finally");
    expect(source).toContain("activeRef.current = false");
    expect(source).toContain("setPending(false)");
  });

  it("keeps every approved first-run network action on the shared guard", () => {
    for (const path of FIRST_RUN_ACTION_SOURCES) {
      const source = readSource(path);
      expect(source, path).toContain(
        'from "@/components/ui/use-recoverable-action"'
      );
      expect(source, path).toContain("useRecoverableAction()");
    }
  });

  it("removes route-owned pending toggles that can strand controls", () => {
    for (const path of FIRST_RUN_ACTION_SOURCES) {
      expect(readSource(path), path).not.toMatch(/\bsetPending\(/);
    }
  });

  it("tells people when retained first-run details are safe to retry", () => {
    const login = readSource("src/app/(auth)/login/page.tsx");
    const signup = readSource("src/app/(auth)/signup/signup-form.tsx");
    const invite = readSource(
      "src/app/(auth)/invite/[token]/accept-button.tsx"
    );
    const onboarding = readSource(
      "src/app/(auth)/onboarding/onboarding-form.tsx"
    );

    expect(login).toContain("Your details are still here");
    expect(signup).toContain("Your details are still here");
    expect(invite).toContain("Check your connection and try again");
    expect(onboarding.match(/Your details are still here/g)).toHaveLength(2);
    expect(onboarding).toContain(
      "Lane couldn’t join this workspace. Check your connection and try again."
    );
  });

  it("shows progress while leaving onboarding for Requests", () => {
    const source = readSource(
      "src/app/(auth)/onboarding/onboarding-form.tsx"
    );

    expect(source).toContain("startNavigation");
    expect(source.match(/loadingLabel="Opening Requests…"/g)).toHaveLength(2);
    expect(source).not.toContain('onClick={() => router.push("/")}');
  });

  it("keeps Signup busy while opening confirmation instructions", () => {
    const source = readSource("src/app/(auth)/signup/signup-form.tsx");

    expect(source).toContain("startNavigation");
    expect(source).toContain("const busy = pending || isNavigating");
    expect(source).toContain("Opening email instructions…");
  });
});
