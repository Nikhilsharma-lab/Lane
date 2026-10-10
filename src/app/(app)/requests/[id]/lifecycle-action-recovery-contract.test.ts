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
  "src/hooks/use-recoverable-action.ts"
);
const WORKSPACE = source("src/app/(app)/requests-workspace.tsx");

describe("Reliable Request lifecycle action contract", () => {
  it("uses the shared immediate lock and guaranteed release path", () => {
    expect(LIFECYCLE).toContain(
      'from "@/hooks/use-recoverable-action"'
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
    expect(LIFECYCLE).toContain("Try again if this Request is still Open");
    expect(LIFECYCLE).toContain("Couldn’t confirm completion");
    expect(LIFECYCLE).toContain(
      "Try again if this Request is still In Progress"
    );
    expect(LIFECYCLE).toContain("router.refresh()");
  });

  it("makes both lifecycle transitions conditional and atomic", () => {
    // Plan item 1.4: each move is one data-modifying CTE. The UPDATE keeps the
    // status guard and the notification INSERT reads from its RETURNING row,
    // so the two commit or fail together (decision 8.17) and a race can only
    // win once. Pick up guards Open → In Progress; Done guards In Progress → Done.
    expect(ACTIONS).toContain('from: "open"');
    expect(ACTIONS).toContain('to: "in_progress"');
    expect(ACTIONS).toContain('from: "in_progress"');
    expect(ACTIONS).toContain('to: "done"');
    expect(ACTIONS).toContain(
      "and ${requests.status} = ${transition.from}::request_status"
    );
    expect(ACTIONS).toContain("insert into ${notifications}");
    expect(ACTIONS).toContain("where u.created_by <> ${auth.userId}");
    // The outer SELECT reads the updated row even when no notification was
    // inserted (self pick up), so success never depends on the INSERT.
    expect(ACTIONS).toContain("from u left join n on true");
    expect(ACTIONS).not.toContain("createNotification(");
    expect(ACTIONS).toContain("changed before Lane could pick it up");
    expect(ACTIONS).toContain("changed before Lane could mark it Done");
  });

  it("runs the diagnostic read only after the single statement matched nothing", () => {
    for (const move of ["PICK_UP", "MARK_DONE"]) {
      const update = ACTIONS.indexOf(`transitionRequest(${move}`);
      const explain = ACTIONS.indexOf(`explainFailedTransition(${move}`);
      expect(update).toBeGreaterThan(-1);
      expect(explain).toBeGreaterThan(update);
      expect(ACTIONS.slice(update, explain)).toContain("if (!updated)");
    }
  });

  it("tells a guest or an outsider apart from a missing Request", () => {
    expect(ACTIONS).toContain(
      'const CANNOT_CHANGE_REQUESTS = "You can\'t change Requests in this workspace."'
    );
    expect(ACTIONS.match(/return \{ error: CANNOT_CHANGE_REQUESTS \}/g)).toHaveLength(
      4
    );
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
