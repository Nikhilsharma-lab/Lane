import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

const LIFECYCLE = source(
  "src/app/(app)/requests/[id]/lifecycle-buttons.tsx"
);
const ACTIONS = source("src/app/(app)/requests/[id]/actions.ts");
const RECOVERY_HOOK = source(
  "src/components/ui/use-recoverable-action.ts"
);
const WORKSPACE = source("src/app/(app)/requests-workspace.tsx");

describe("Reliable Request lifecycle action contract", () => {
  it("uses the shared immediate lock and guaranteed release path", () => {
    expect(LIFECYCLE).toContain(
      'from "@/components/ui/use-recoverable-action"'
    );
    expect(LIFECYCLE).toContain("useRecoverableAction()");
    expect(LIFECYCLE).not.toMatch(/\bsetPending\(/);
    expect(RECOVERY_HOOK).toContain("const activeRef = useRef(false)");
    expect(RECOVERY_HOOK).toContain("if (activeRef.current)");
    expect(RECOVERY_HOOK).toContain("finally");
    expect(RECOVERY_HOOK).toContain("setPending(false)");
  });

  it("keeps loading visible, labelled, and keyboard-safe", () => {
    expect(LIFECYCLE).toContain("LoaderCircleIcon");
    expect(LIFECYCLE).toContain('data-icon="inline-start"');
    expect(LIFECYCLE).toContain('aria-busy={pending || undefined}');
    expect(LIFECYCLE).toContain('disabled={pending}');
    expect(LIFECYCLE).toContain("Picking up…");
    expect(LIFECYCLE).toContain("Completing…");
  });

  it("explains uncertain network outcomes without inventing state", () => {
    expect(LIFECYCLE).toContain("Couldn’t confirm pickup");
    expect(LIFECYCLE).toContain("try again if this Request remains Open");
    expect(LIFECYCLE).toContain("Couldn’t confirm completion");
    expect(LIFECYCLE).toContain(
      "try again if this Request remains In Progress"
    );
    expect(LIFECYCLE).toContain("router.refresh()");
  });

  it("makes both lifecycle transitions conditional and atomic", () => {
    expect(ACTIONS).toContain('eq(requests.status, "open")');
    expect(ACTIONS).toContain('eq(requests.status, "in_progress")');
    expect(ACTIONS.match(/\.returning\(\{ id: requests\.id \}\)/g)).toHaveLength(
      2
    );
    expect(ACTIONS).toContain("changed before Lane could pick it up");
    expect(ACTIONS).toContain("changed before Lane could mark it Done");
  });

  it("keeps lifecycle actions in detail and removes the dead list action", () => {
    expect(WORKSPACE).toContain("<LifecycleButtons");
    expect(WORKSPACE).not.toContain("PickUpButton");
    expect(
      existsSync(
        join(process.cwd(), "src/app/(app)/pick-up-button.tsx")
      )
    ).toBe(false);
  });
});
