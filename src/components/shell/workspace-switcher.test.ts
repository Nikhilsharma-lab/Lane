import { afterEach, describe, expect, it, vi } from "vitest";
import type { AuthAnswer } from "@/lib/auth-answer";
import { OfflineError } from "@/lib/offline-error";
import { ShownFailure, worthRetrying } from "@/lib/failure-messages";
import { createWorkspaceSwitch, type WorkspaceSwitchSnapshot } from "./workspace-switcher";
import { assertWorkspaceCanSwitch, WORKSPACE_SWITCH_EVENT } from "@/lib/workspace-switch-guard";

function fixture() {
  const events: string[] = [];
  let snapshot: WorkspaceSwitchSnapshot = {
    currentId: "org-a",
    items: [{ id: "org-a", name: "Lane" }, { id: "org-b", name: "Studio" }],
  };
  const switched = async (id: string): Promise<AuthAnswer> => { events.push(`switch:${id}`); return { ok: true }; };
  let switchTo = switched;
  const target = new EventTarget();
  const select = createWorkspaceSwitch({
    getSnapshot: () => snapshot,
    switchTo: id => switchTo(id),
    beforeSwitch: () => assertWorkspaceCanSwitch(target),
    onPendingChange: id => events.push(`pending:${id}`),
    replace: href => events.push(`replace:${href}`),
  });
  return {
    events, target, select, switched,
    snapshot: () => snapshot,
    update: (values: Partial<WorkspaceSwitchSnapshot>) => { snapshot = { ...snapshot, ...values }; },
    answering: (answer: typeof switched) => { switchTo = answer; },
  };
}

describe("the workspace switch", () => {
  it("switches to the selected workspace, then loads its Requests as a new document", async () => {
    const f = fixture();
    await f.select("org-b");
    expect(f.events).toEqual(["pending:org-b", "switch:org-b", "replace:/"]);
  });

  it("does nothing for the current workspace", async () => {
    const f = fixture();
    await f.select("org-a");
    expect(f.events).toEqual([]);
  });

  it("refuses a workspace that isn’t in the person’s list", async () => {
    const f = fixture();
    await expect(f.select("org-forged")).rejects.toThrow(/no longer available/i);
    expect(f.events).toEqual([]);
  });

  // #269 (A111): the menu offers Try again only when trying again can work.
  it("answers a workspace that's gone for good with no Try again; a refusal or a failed call keeps it", async () => {
    const f = fixture();
    const gone = await f.select("org-forged").catch((failure: unknown) => failure);
    expect(worthRetrying(gone)).toBe(false);
    f.answering(async () => ({ ok: false, code: "USER_IS_NOT_A_MEMBER_OF_THE_ORGANIZATION" }));
    expect(worthRetrying(await f.select("org-b").catch((failure: unknown) => failure))).toBe(true);
    f.answering(async () => { throw new Error("private provider payload"); });
    expect(worthRetrying(await f.select("org-b").catch((failure: unknown) => failure))).toBe(true);
    expect(worthRetrying(new OfflineError())).toBe(true);
  });

  it.each([WORKSPACE_SWITCH_EVENT, "beforeunload"])("honors %s veto before the workspace changes", async eventName => {
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
    f.answering(async id => { await new Promise<void>(resolve => { finish = resolve; }); return f.switched(id); });
    const pending = f.select("org-b");
    await Promise.resolve();
    await f.select("org-b");
    expect(f.events).toEqual(["pending:org-b"]);
    finish();
    await pending;
    expect(f.events).toEqual(["pending:org-b", "switch:org-b", "replace:/"]);
  });

  it.each([
    ["refused", async (): Promise<AuthAnswer> => ({ ok: false, code: "USER_IS_NOT_A_MEMBER_OF_THE_ORGANIZATION" })],
    ["a call that fails", async (): Promise<AuthAnswer> => { throw new Error("private provider payload"); }],
  ])("says a switch that is %s failed in Lane's words, stays, and can be tried again", async (_what, answer) => {
    const f = fixture();
    f.answering(answer);
    const failed = f.select("org-b");
    await expect(failed).rejects.toThrow("Couldn’t switch workspace. Try again.");
    // #269: the failure is never shown as it is; the menu says it in Lane's words.
    await expect(failed).rejects.not.toBeInstanceOf(ShownFailure);
    expect(f.events).toEqual(["pending:org-b", "pending:null"]);
    f.answering(f.switched);
    await f.select("org-b");
    expect(f.events.slice(-3)).toEqual(["pending:org-b", "switch:org-b", "replace:/"]);
  });

  it.each([
    { change: { currentId: "org-c" }, error: /reload/i },
    { change: { items: [{ id: "org-a", name: "Lane" }] }, error: /no longer available/i },
  ])("rechecks the page's workspace and the list after an asynchronous draft guard: %j", async ({ change, error }) => {
    const f = fixture();
    let finish!: () => void;
    const select = createWorkspaceSwitch({
      getSnapshot: f.snapshot,
      switchTo: f.switched,
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
      const finishes: (() => void)[] = [];
      let goOffline: () => void = () => {};
      const select = createWorkspaceSwitch({
        getSnapshot: f.snapshot,
        switchTo: async id => {
          calls.push(`switch:${id}`);
          if (id === "org-a") return { ok: true };
          return new Promise<AuthAnswer>(resolve => { finishes.push(() => resolve({ ok: true })); });
        },
        beforeSwitch: () => {},
        onPendingChange: id => f.events.push(`pending:${id}`),
        replace: href => f.events.push(`replace:${href}`),
        isOffline: () => options.offline ?? false,
        watchOffline: onOffline => { goOffline = onOffline; return () => { goOffline = () => {}; }; },
        timeoutMs: options.timeoutMs ?? 10_000,
      });
      return { ...f, calls, select, finish: () => finishes.shift()!(), goOffline: () => goOffline() };
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
      await vi.waitFor(() => expect(f.calls).toEqual(["switch:org-b"]));
      f.goOffline();
      await expect(pending).rejects.toBeInstanceOf(OfflineError);
      expect(f.events).toEqual(["pending:org-b", "pending:null"]);
    });

    it("gives up after a while, and an answer that comes later leaves the person where they are", async () => {
      vi.useFakeTimers();
      const f = failing({ timeoutMs: 10_000 });
      const pending = f.select("org-b");
      const outcome = expect(pending).rejects.toThrow("Couldn’t switch workspace. Try again.");
      await vi.advanceTimersByTimeAsync(10_000);
      await outcome;
      expect(f.events).toEqual(["pending:org-b", "pending:null"]);
      // The old switch goes through after all: no move to the other workspace, and the session goes back.
      f.finish();
      await vi.runAllTimersAsync();
      expect(f.events).not.toContain("replace:/");
      expect(f.calls).toEqual(["switch:org-b", "switch:org-a"]);
    });

    it("can be tried again once it has given up", async () => {
      vi.useFakeTimers();
      const f = failing({ timeoutMs: 10_000 });
      const first = expect(f.select("org-b")).rejects.toThrow();
      await vi.advanceTimersByTimeAsync(10_000);
      await first;
      const second = f.select("org-b");
      await vi.advanceTimersByTimeAsync(0);
      // The first switch's late answer doesn't undo the second.
      f.finish();
      await vi.advanceTimersByTimeAsync(0);
      f.finish();
      await second;
      expect(f.events.at(-1)).toBe("replace:/");
      expect(f.calls).toEqual(["switch:org-b", "switch:org-b"]);
    });
  });
});
