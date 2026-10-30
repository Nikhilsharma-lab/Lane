import { beforeEach, describe, expect, it, vi } from "vitest";
import { listLabels } from "@/app/(app)/intake/label-actions";
import { createWorkspaceLabels } from "./workspace-labels";
import { DEFAULT_LABELS, type RequestLabel } from "@/lib/request-labels";

vi.mock("@/app/(app)/intake/label-actions", () => ({ listLabels: vi.fn() }));

beforeEach(() => vi.mocked(listLabels).mockReset());

describe("workspace Labels read adapter", () => {
  it("keeps the newer read's entries and permission when an older read finishes", async () => {
    const older = Promise.withResolvers<Awaited<ReturnType<typeof listLabels>>>();
    const newer = Promise.withResolvers<Awaited<ReturnType<typeof listLabels>>>();
    vi.mocked(listLabels).mockReturnValueOnce(older.promise).mockReturnValueOnce(newer.promise);
    const catalogue = createWorkspaceLabels("workspace-a", { labels: DEFAULT_LABELS, canCreate: true });
    const a = catalogue.getSnapshot().reload(), b = catalogue.getSnapshot().reload();
    const current: RequestLabel = { id: "new", name: "Current", colour: "blue", projectId: null };
    newer.resolve({ success: true, labels: [current], canCreate: false });
    await b;
    older.resolve({ success: true, labels: DEFAULT_LABELS, canCreate: true });
    await a;
    expect(catalogue.getSnapshot()).toMatchObject({ entries: [current], metadata: false, loading: false, error: null });
  });
  it("retains a confirmed addition until a current read acknowledges the server record", async () => {
    const pending = Promise.withResolvers<Awaited<ReturnType<typeof listLabels>>>();
    vi.mocked(listLabels).mockReturnValueOnce(pending.promise);
    const catalogue = createWorkspaceLabels("workspace-a", { labels: DEFAULT_LABELS, canCreate: true });
    const loading = catalogue.getSnapshot().reload();
    const created: RequestLabel = { id: "created", name: "Created", colour: "blue", projectId: "project-a" };
    catalogue.getSnapshot().add(created);
    pending.resolve({ success: true, labels: DEFAULT_LABELS, canCreate: true });
    await loading;
    expect(catalogue.getSnapshot().entries).toEqual([...DEFAULT_LABELS, created]);
    const acknowledged: RequestLabel = { ...created, name: "Saved name", colour: "green" };
    vi.mocked(listLabels).mockResolvedValueOnce({ success: true, labels: [acknowledged, ...DEFAULT_LABELS], canCreate: false });
    await catalogue.getSnapshot().reload();
    expect(catalogue.getSnapshot()).toMatchObject({ entries: [acknowledged, ...DEFAULT_LABELS], metadata: false });
    vi.mocked(listLabels).mockResolvedValueOnce({ success: true, labels: DEFAULT_LABELS, canCreate: false });
    await catalogue.getSnapshot().reload();
    expect(catalogue.getSnapshot().entries).toEqual(DEFAULT_LABELS);
  });
  it("seeds a fresh subscription lifetime and rejects callbacks from before cleanup", async () => {
    const pending = Promise.withResolvers<Awaited<ReturnType<typeof listLabels>>>();
    vi.mocked(listLabels).mockReturnValueOnce(pending.promise);
    const catalogue = createWorkspaceLabels("workspace-a", { labels: DEFAULT_LABELS, canCreate: false });
    const unmount = catalogue.subscribe(() => {});
    const stale = catalogue.getSnapshot();
    stale.add({ id: "old", name: "Old addition", colour: "red" });
    const loading = stale.reload();
    unmount();
    const remount = catalogue.subscribe(() => {});
    expect(catalogue.getSnapshot()).toMatchObject({ entries: DEFAULT_LABELS, metadata: false, loading: false, error: null });
    stale.add({ id: "late", name: "Late creation", colour: "blue" });
    await stale.reload();
    pending.resolve({ success: true, labels: [], canCreate: true });
    await loading;
    expect(catalogue.getSnapshot()).toMatchObject({ entries: DEFAULT_LABELS, metadata: false, loading: false, error: null });
    vi.mocked(listLabels).mockResolvedValueOnce({ success: true, labels: [], canCreate: true });
    await catalogue.getSnapshot().reload();
    expect(catalogue.getSnapshot()).toMatchObject({ entries: [], metadata: true });
    remount();
  });
  it("keeps Label order, scope and default IDs instead of applying Project sorting", async () => {
    const scoped: RequestLabel = { id: "scoped", name: "Alpha", colour: "blue", projectId: "project-a" };
    const catalogue = createWorkspaceLabels("workspace-a", { labels: DEFAULT_LABELS, canCreate: true });
    catalogue.getSnapshot().add(scoped);
    catalogue.getSnapshot().add(DEFAULT_LABELS[0]);
    expect(catalogue.getSnapshot().entries.map(entry => entry.id)).toEqual(["improvement", "new_feature", "scoped", "bug"]);
    vi.mocked(listLabels).mockResolvedValueOnce({ success: true, labels: [...DEFAULT_LABELS, scoped], canCreate: false });
    await catalogue.getSnapshot().reload();
    expect(catalogue.getSnapshot()).toMatchObject({ entries: [...DEFAULT_LABELS, scoped], metadata: false });
  });


});
