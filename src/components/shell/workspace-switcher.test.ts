import { describe, expect, it } from "vitest";
import { createWorkspaceSwitch, type WorkspaceSwitchSnapshot } from "./workspace-switcher";
import { assertWorkspaceCanSwitch, WORKSPACE_SWITCH_EVENT } from "@/lib/workspace-switch-guard";

function fixture() {
  const events: string[] = [];
  let snapshot: WorkspaceSwitchSnapshot = {
    loaded: true,
    userId: "user-a",
    currentId: "org-a",
    activeId: "org-a",
    items: [{ id: "org-a", name: "Lane" }, { id: "org-b", name: "Studio" }],
    setActive: async ({ organization, navigate }) => {
      events.push(`activate:${organization}`);
      await navigate?.({ decorateUrl: (path: string) => `${path}?clerk-refresh=1` } as Parameters<NonNullable<typeof navigate>>[0]);
    },
  };
  const target = new EventTarget();
  const select = createWorkspaceSwitch({
    getSnapshot: () => snapshot,
    beforeSwitch: () => assertWorkspaceCanSwitch(target),
    onPendingChange: id => events.push(`pending:${id}`),
    replace: href => events.push(`replace:${href}`),
  });
  return { events, target, select, snapshot: () => snapshot, update: (values: Partial<WorkspaceSwitchSnapshot>) => { snapshot = { ...snapshot, ...values }; } };
}

describe("Clerk workspace switching boundary", () => {
  it("activates only the selected membership then replaces the document using Clerk's decorated destination", async () => {
    const f = fixture();
    await f.select("org-b");
    expect(f.events).toEqual(["pending:org-b", "activate:org-b", "replace:/?clerk-refresh=1"]);
  });

  it("does nothing for the current workspace", async () => {
    const f = fixture();
    await f.select("org-a");
    expect(f.events).toEqual([]);
  });

  it("rejects a workspace that was not returned by Clerk memberships", async () => {
    const f = fixture();
    await expect(f.select("org-forged")).rejects.toThrow(/no longer available/i);
    expect(f.events).toEqual([]);
  });

  it.each([
    { loaded: false },
    { userId: null },
    { activeId: "org-other" },
    { setActive: undefined },
  ])("never activates from unresolved or stale authenticated context: %j", async values => {
    const f = fixture();
    f.update(values);
    await expect(f.select("org-b")).rejects.toThrow(/workspace.*loading|reload/i);
    expect(f.events).toEqual([]);
  });

  it.each([WORKSPACE_SWITCH_EVENT, "beforeunload"])("honors %s veto before Clerk can change the active workspace", async eventName => {
    const f = fixture();
    f.target.addEventListener(eventName, event => event.preventDefault());
    await expect(f.select("org-b")).rejects.toThrow(/finish.*request|unsaved files/i);
    expect(f.events).toEqual(["pending:org-b", "pending:null"]);
  });

  it("blocks duplicate activation while a previous switch is unresolved", async () => {
    const f = fixture();
    let finish!: () => void;
    f.update({ setActive: async () => { f.events.push("activate:org-b"); await new Promise<void>(resolve => { finish = resolve; }); } });
    const pending = f.select("org-b");
    await Promise.resolve();
    await f.select("org-b");
    expect(f.events).toEqual(["pending:org-b", "activate:org-b"]);
    finish();
    await pending;
  });

  it("sanitizes an activation failure and allows the same workspace to be retried", async () => {
    const f = fixture();
    const original = f.snapshot().setActive;
    f.update({ setActive: async () => { throw new Error("private provider payload"); } });
    await expect(f.select("org-b")).rejects.toThrow("Could not switch workspaces. Try again.");
    expect(f.events).toEqual(["pending:org-b", "pending:null"]);
    f.update({ setActive: original });
    await f.select("org-b");
    expect(f.events.slice(-3)).toEqual(["pending:org-b", "activate:org-b", "replace:/?clerk-refresh=1"]);
  });

  it.each([
    { change: { userId: "user-other" }, error: /reload/i },
    { change: { activeId: "org-other" }, error: /reload/i },
    { change: { items: [{ id: "org-a", name: "Lane" }] }, error: /no longer available/i },
  ])("rechecks authenticated context and membership after an asynchronous draft guard: %j", async ({ change, error }) => {
    const f = fixture();
    let finish!: () => void;
    const select = createWorkspaceSwitch({
      getSnapshot: f.snapshot,
      beforeSwitch: () => new Promise<void>(resolve => { finish = resolve; }),
      onPendingChange: id => f.events.push(`pending:${id}`),
      replace: href => f.events.push(`replace:${href}`),
    });
    const pending = select("org-b");
    f.update(change);
    finish();
    await expect(pending).rejects.toThrow(error);
    expect(f.events).toEqual(["pending:org-b", "pending:null"]);
  });
});
