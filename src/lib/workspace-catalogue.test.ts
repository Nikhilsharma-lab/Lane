import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { listProjects, type ListProjectsResponse } from "@/app/(app)/intake/project-actions";
import { listLabels } from "@/app/(app)/intake/label-actions";
import { createWorkspaceProjects } from "@/components/projects/workspace-projects-provider";
import { createWorkspaceLabels } from "@/components/requests/workspace-labels";
import type { ProjectOption } from "./request-constants";
import type { RequestLabel } from "./request-labels";
import type { createWorkspaceCatalogue } from "./workspace-catalogue";

vi.mock("@/app/(app)/intake/project-actions", () => ({ listProjects: vi.fn() }));
vi.mock("@/app/(app)/intake/label-actions", () => ({ listLabels: vi.fn() }));
afterEach(() => vi.unstubAllGlobals());

type LabelResponse = Awaited<ReturnType<typeof listLabels>>;
type Outcome = "success" | "failure" | "throw";

/** The same lifecycle contract runs through each real adapter and callAction. */
function catalogueContract<Entry extends { id: string; name: string }, Metadata, Response>(options: {
  name: string; read: (context: { orgId: string }) => Promise<Response>;
  create: (orgId: string) => ReturnType<typeof createWorkspaceCatalogue<Entry, Metadata>>;
  seed: Entry; current: Entry; local: Entry; acknowledged: Entry;
  seedMetadata: Metadata; currentMetadata: Metadata;
  success: (entries: Entry[], metadata: Metadata) => Response;
  failure: (message: string, expired?: boolean) => Response;
}) {
  const { seed, current, local, acknowledged, seedMetadata, currentMetadata } = options;
  describe(`${options.name}: production catalogue adapter`, () => {
    beforeEach(() => vi.mocked(options.read).mockReset());
    function queued() {
      const pending = Promise.withResolvers<Response>();
      vi.mocked(options.read).mockReturnValueOnce(pending.promise);
      return pending;
    }
    function finish(pending: ReturnType<typeof queued>, outcome: Outcome) {
      if (outcome === "throw") pending.reject(new Error("Network unavailable"));
      else pending.resolve(outcome === "success" ? options.success([seed], seedMetadata) : options.failure("Older read failed"));
    }

    it.each<Outcome>(["success", "failure", "throw"])("ignores older %s after the latest read succeeds", async outcome => {
      const older = queued(), newer = queued(), catalogue = options.create("workspace-a");
      const a = catalogue.getSnapshot().reload(), b = catalogue.getSnapshot().reload();
      newer.resolve(options.success([current], currentMetadata)); await b;
      finish(older, outcome); await a;
      expect(catalogue.getSnapshot()).toMatchObject({ entries: [current], metadata: currentMetadata, loading: false, error: null });
    });

    it.each<Outcome>(["success", "failure", "throw"])("older %s cannot end the newer loading state", async outcome => {
      const older = queued(), newer = queued(), catalogue = options.create("workspace-a");
      const a = catalogue.getSnapshot().reload(), b = catalogue.getSnapshot().reload();
      finish(older, outcome); await a;
      expect(catalogue.getSnapshot()).toMatchObject({ entries: [seed], metadata: seedMetadata, loading: true, error: null });
      newer.resolve(options.success([current], currentMetadata)); await b;
      expect(catalogue.getSnapshot()).toMatchObject({ entries: [current], metadata: currentMetadata, loading: false, error: null });
    });

    it("only a current acknowledgement retires a confirmed local creation", async () => {
      const older = queued(), newer = queued(), catalogue = options.create("workspace-a");
      const a = catalogue.getSnapshot().reload();
      catalogue.getSnapshot().add(local);
      const b = catalogue.getSnapshot().reload();
      newer.resolve(options.success([seed], seedMetadata)); await b;
      older.resolve(options.success([acknowledged, seed], currentMetadata)); await a;
      vi.mocked(options.read).mockImplementationOnce(async () => options.success([seed], seedMetadata));
      await catalogue.getSnapshot().reload();
      expect(catalogue.getSnapshot().entries.map(entry => entry.id).sort()).toEqual(["local", "seed"]);
      expect(catalogue.getSnapshot().entries.find(entry => entry.id === "local")).toEqual(local);
      vi.mocked(options.read).mockImplementationOnce(async () => options.success([seed, acknowledged], currentMetadata));
      await catalogue.getSnapshot().reload();
      expect(catalogue.getSnapshot().entries.filter(entry => entry.id === "local")).toEqual([acknowledged]);
      vi.mocked(options.read).mockImplementationOnce(async () => options.success([seed], currentMetadata));
      await catalogue.getSnapshot().reload();
      expect(catalogue.getSnapshot().entries).toEqual([seed]);
    });

    it.each<Outcome>(["failure", "throw"])("retains usable entries and permission through %s then clears the error on retry", async outcome => {
      const pending = queued(), catalogue = options.create("workspace-a");
      catalogue.getSnapshot().add(local);
      const loading = catalogue.getSnapshot().reload(); finish(pending, outcome); await loading;
      expect(catalogue.getSnapshot().entries.map(entry => entry.id).sort()).toEqual(["local", "seed"]);
      expect(catalogue.getSnapshot()).toMatchObject({ metadata: seedMetadata, loading: false });
      expect(catalogue.getSnapshot().error).toBeTruthy();
      vi.mocked(options.read).mockImplementationOnce(async () => options.success([seed, acknowledged], currentMetadata));
      await catalogue.getSnapshot().reload();
      expect(catalogue.getSnapshot()).toMatchObject({ error: null, loading: false, metadata: currentMetadata });
    });

    it("an older success cannot erase the latest failure", async () => {
      const older = queued(), newer = queued(), catalogue = options.create("workspace-a");
      const a = catalogue.getSnapshot().reload(), b = catalogue.getSnapshot().reload();
      newer.resolve(options.failure("Latest read failed")); await b;
      older.resolve(options.success([current], currentMetadata)); await a;
      expect(catalogue.getSnapshot()).toMatchObject({ entries: [seed], metadata: seedMetadata, loading: false, error: "Latest read failed" });
    });

    it.each<Outcome>(["success", "failure", "throw"])("rejects old add, reload and %s callbacks across cleanup/reconnect", async outcome => {
      const older = queued(), newer = queued(), catalogue = options.create("workspace-a");
      const disconnect = catalogue.subscribe(() => {}), stale = catalogue.getSnapshot();
      stale.add(local); const a = stale.reload(); disconnect();
      const cleanup = catalogue.subscribe(() => {});
      disconnect(); // Repeated old cleanup must not invalidate the new subscription.
      expect(catalogue.getSnapshot()).toMatchObject({ entries: [seed], metadata: seedMetadata, loading: false, error: null });
      const b = catalogue.getSnapshot().reload();
      stale.add(local); await stale.reload(); finish(older, outcome); await a;
      expect(catalogue.getSnapshot()).toMatchObject({ entries: [seed], metadata: seedMetadata, loading: true, error: null });
      newer.resolve(options.success([current], currentMetadata)); await b;
      expect(catalogue.getSnapshot()).toMatchObject({ entries: [current], metadata: currentMetadata, loading: false, error: null });
      expect(vi.mocked(options.read).mock.calls).toEqual([[{ orgId: "workspace-a" }], [{ orgId: "workspace-a" }]]);
      cleanup();
    });

    it("keeps the current lifetime until its final subscriber leaves", () => {
      const catalogue = options.create("workspace-a");
      const first = catalogue.subscribe(() => {}), last = catalogue.subscribe(() => {});
      const actions = catalogue.getSnapshot();
      first(); first();
      actions.add(local);
      expect(catalogue.getSnapshot().entries.map(entry => entry.id).sort()).toEqual(["local", "seed"]);
      last();
      actions.add(local);
      expect(catalogue.getSnapshot().entries).toEqual([seed]);
    });

    it("keeps A to B to A owners separate and never sends a stale reload", async () => {
      const pending = queued(), a = options.create("workspace-a");
      const stopA = a.subscribe(() => {}), stale = a.getSnapshot();
      stale.add(local); const loading = stale.reload(); stopA();
      const b = options.create("workspace-b"), stopB = b.subscribe(() => {});
      vi.mocked(options.read).mockImplementationOnce(async () => options.success([current], currentMetadata));
      await b.getSnapshot().reload(); stopB();
      const again = options.create("workspace-a"), stopAgain = again.subscribe(() => {});
      stale.add(local); await stale.reload();
      pending.resolve(options.success([local], currentMetadata)); await loading;
      expect(again.getSnapshot()).toMatchObject({ entries: [seed], metadata: seedMetadata, loading: false, error: null });
      expect(vi.mocked(options.read).mock.calls).toEqual([[{ orgId: "workspace-a" }], [{ orgId: "workspace-b" }]]);
      stopAgain();
    });

    it("preserves explicit session recovery and the original workspace", async () => {
      const getToken = vi.fn().mockResolvedValue("test-token");
      vi.stubGlobal("Clerk", { session: { getToken } });
      vi.mocked(options.read).mockImplementationOnce(async () => options.failure("Session expired", true)).mockImplementationOnce(async () => options.success([current], currentMetadata));
      const catalogue = options.create("workspace-a");
      await catalogue.getSnapshot().reload();
      expect(catalogue.getSnapshot()).toMatchObject({ entries: [current], metadata: currentMetadata, error: null });
      expect(vi.mocked(options.read).mock.calls).toEqual([[{ orgId: "workspace-a" }], [{ orgId: "workspace-a" }]]);
      expect(getToken.mock.calls).toEqual([[], [{ skipCache: true }]]);
    });

    it("does not replay a permission failure based on authentication words", async () => {
      const getToken = vi.fn().mockResolvedValue("test-token");
      vi.stubGlobal("Clerk", { session: { getToken } });
      vi.mocked(options.read).mockImplementationOnce(async () => options.failure("Unauthorized token: permission refused"));
      const catalogue = options.create("workspace-a");
      await catalogue.getSnapshot().reload();
      expect(catalogue.getSnapshot()).toMatchObject({ entries: [seed], metadata: seedMetadata, error: "Unauthorized token: permission refused", loading: false });
      expect(vi.mocked(options.read).mock.calls).toEqual([[{ orgId: "workspace-a" }]]);
      expect(getToken.mock.calls).toEqual([[]]);
    });
  });
}

const projectSeed: ProjectOption = { id: "seed", name: "Zulu", description: null };
const projectLocal: ProjectOption = { id: "local", name: "Alpha", description: "Local description" };
catalogueContract<ProjectOption, null, ListProjectsResponse>({
  name: "Projects", read: listProjects, create: orgId => createWorkspaceProjects(orgId, [projectSeed]),
  seed: projectSeed, current: { id: "current", name: "Current", description: null }, local: projectLocal,
  acknowledged: { ...projectLocal, name: "Saved name", description: "Server description" }, seedMetadata: null, currentMetadata: null,
  success: (projects) => ({ success: true, projects }),
  failure: (message, expired) => ({ success: false, error: { code: expired ? "session_expired" : "load_failed", message } }),
});
const labelSeed: RequestLabel = { id: "seed", name: "Zulu", colour: "red", projectId: null };
const labelLocal: RequestLabel = { id: "local", name: "Alpha", colour: "blue", projectId: "project-a" };
catalogueContract<RequestLabel, boolean, LabelResponse>({
  name: "Labels", read: listLabels, create: orgId => createWorkspaceLabels(orgId, { labels: [labelSeed], canCreate: true }),
  seed: labelSeed, current: { id: "current", name: "Current", colour: "green", projectId: null }, local: labelLocal,
  acknowledged: { ...labelLocal, name: "Saved name", colour: "purple", projectId: null }, seedMetadata: true, currentMetadata: false,
  success: (labels, canCreate) => ({ success: true, labels, canCreate }),
  failure: (error, expired) => ({ success: false, error, ...(expired ? { sessionExpired: true } : {}) }),
});
