import { afterEach, describe, expect, it, vi } from "vitest";
import { OfflineError } from "@/lib/offline-error";
import { ShownFailure, worthRetrying } from "@/lib/failure-messages";
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

  // #269 (A111): the menu offers Try again only when trying again can work.
  it("answers a workspace that's gone for good with no Try again; a refusal or a slow answer from Clerk keeps it", async () => {
    const f = fixture();
    const gone = await f.select("org-forged").catch((failure: unknown) => failure);
    expect(worthRetrying(gone)).toBe(false);
    f.update({ setActive: async () => { throw new Error("private provider payload"); } });
    const refused = await f.select("org-b").catch((failure: unknown) => failure);
    expect(worthRetrying(refused)).toBe(true);
    expect(worthRetrying(new OfflineError())).toBe(true);
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
    const vetoed = f.select("org-b");
    await expect(vetoed).rejects.toThrow(/finish.*request|unsaved files/i);
    // #269: Lane's own reason is shown to the person as it is.
    await expect(vetoed).rejects.toBeInstanceOf(ShownFailure);
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
    const failed = f.select("org-b");
    await expect(failed).rejects.toThrow("Couldn't switch workspace. Try again.");
    // #269: Clerk's failure is never shown as it is; the menu says it in Lane's words.
    await expect(failed).rejects.not.toBeInstanceOf(ShownFailure);
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

  // #269 (A111): offline or unanswered, a switch ends, stays on this workspace and can be tried again.
  describe("when the switch can't get through", () => {
    afterEach(() => { vi.useRealTimers(); });

    function failing(options: { offline?: boolean; timeoutMs?: number } = {}) {
      const f = fixture();
      const calls: string[] = [];
      let finish!: () => void;
      let goOffline: () => void = () => {};
      f.update({ setActive: (async ({ organization, navigate }: { organization: string; navigate?: (input: { decorateUrl: (path: string) => string }) => Promise<void> }) => {
        calls.push(`activate:${organization}`);
        if (organization === "org-a") return;
        await new Promise<void>(resolve => { finish = resolve; });
        await navigate?.({ decorateUrl: (path: string) => path });
      }) as WorkspaceSwitchSnapshot["setActive"] });
      const select = createWorkspaceSwitch({
        getSnapshot: f.snapshot,
        beforeSwitch: () => {},
        onPendingChange: id => f.events.push(`pending:${id}`),
        replace: href => f.events.push(`replace:${href}`),
        isOffline: () => options.offline ?? false,
        watchOffline: onOffline => { goOffline = onOffline; return () => { goOffline = () => {}; }; },
        timeoutMs: options.timeoutMs ?? 10_000,
      });
      return { ...f, calls, select, finish: () => finish(), goOffline: () => goOffline() };
    }

    it("says it's offline at once and never starts the switch", async () => {
      const f = failing({ offline: true });
      await expect(f.select("org-b")).rejects.toBeInstanceOf(OfflineError);
      expect(f.events).toEqual([]);
      expect(f.calls).toEqual([]);
    });

    it("ends the switch when the connection drops while it waits", async () => {
      const f = failing();
      const pending = f.select("org-b");
      await vi.waitFor(() => expect(f.calls).toEqual(["activate:org-b"]));
      f.goOffline();
      await expect(pending).rejects.toBeInstanceOf(OfflineError);
      expect(f.events).toEqual(["pending:org-b", "pending:null"]);
    });

    it("gives up after a while, and an answer that comes later leaves the person where they are", async () => {
      vi.useFakeTimers();
      const f = failing({ timeoutMs: 10_000 });
      const pending = f.select("org-b");
      const outcome = expect(pending).rejects.toThrow("Couldn't switch workspace. Try again.");
      await vi.advanceTimersByTimeAsync(10_000);
      await outcome;
      expect(f.events).toEqual(["pending:org-b", "pending:null"]);
      // Clerk finishes the old switch after all: no move to the other workspace, and the session goes back.
      f.finish();
      await vi.runAllTimersAsync();
      expect(f.events).not.toContain("replace:/");
      expect(f.calls).toEqual(["activate:org-b", "activate:org-a"]);
    });

    it("can be tried again once it has given up", async () => {
      vi.useFakeTimers();
      const f = failing({ timeoutMs: 10_000 });
      const first = expect(f.select("org-b")).rejects.toThrow();
      await vi.advanceTimersByTimeAsync(10_000);
      await first;
      const second = f.select("org-b");
      await vi.advanceTimersByTimeAsync(0);
      f.finish();
      await second;
      expect(f.events.at(-1)).toBe("replace:/");
    });
  });
});
