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
// Every Pick up and Mark Done, single or bulk, runs through this one module.
const TRANSITION = source("src/lib/request-transition.ts");
const MOVE_RULES = source("src/lib/request-lifecycle.ts");
const RECOVERY_HOOK = source(
  "src/hooks/use-recoverable-action.ts"
);
const WORKSPACE = source("src/app/(app)/request-detail-workspace.tsx");
// Plan item 2.12: the page and the list's preview render the same detail pane.
const DETAIL_PANE = source("src/components/requests/request-detail-pane.tsx");

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
      "Try again if this Request is still In progress"
    );
    expect(LIFECYCLE).toContain("router.refresh()");
  });

  it("makes both lifecycle transitions conditional and atomic", () => {
    // Plan item 1.4: each move is one data-modifying CTE. The UPDATE keeps the
    // status guard and the notification INSERT reads from its RETURNING row,
    // so the two commit or fail together (decision 8.17) and a race can only
    // win once. Pick up guards Open → In progress; Done guards In progress → Done.
    expect(MOVE_RULES).toContain('from: "open", to: "in_progress"');
    expect(MOVE_RULES).toContain('from: "in_progress", to: "done"');
    expect(TRANSITION).toContain(
      "and ${requests.status} = ${transition.from}::request_status"
    );
    // The one notification writer (migration 0032), inside the same statement.
    expect(TRANSITION).toContain("${notify([sql`u.created_by`]");
    // The moved ids come from the UPDATE, not the INSERT, so a self pick up
    // (no notification) still succeeds.
    expect(TRANSITION).toContain("select u.id as id from u");
    expect(TRANSITION).not.toContain("createNotification(");
    expect(MOVE_RULES).toContain('verb: "pick it up"');
    expect(MOVE_RULES).toContain('verb: "mark it Done"');
    expect(TRANSITION).toContain("changed before Lane could ${transition.verb}");
  });

  it("makes a single move a bulk move of one", () => {
    expect(ACTIONS).toContain('transitionRequests(move, [requestId], context)');
    expect(ACTIONS).not.toContain("explainFailedTransition");
  });

  it("tells a guest or an outsider apart from a missing Request", () => {
    expect(TRANSITION).toContain(
      'export const CANNOT_CHANGE_REQUESTS = "You can\'t change Requests in this workspace."'
    );
  });

  it("keeps lifecycle actions in detail and removes the dead list action", () => {
    expect(WORKSPACE).toContain("<RequestDetailPane");
    expect(DETAIL_PANE).toContain("<LifecycleButtons");
    expect(WORKSPACE).not.toContain("PickUpButton");
    expect(
      existsSync(
        join(process.cwd(), "src/app/(app)/pick-up-button.tsx")
      )
    ).toBe(false);
  });
});
