import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const RECOVERY_HOOK = join(
  process.cwd(),
  "src/components/ui/use-recoverable-action.ts"
);

const FIRST_RUN_ACTION_SOURCES = [
  "src/app/(auth)/onboarding/role-form.tsx",
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
    const roleForm = readSource("src/app/(auth)/onboarding/role-form.tsx");

    expect(roleForm).toContain(
      "Your role selection is still here. Check your connection and try again."
    );
  });
});
