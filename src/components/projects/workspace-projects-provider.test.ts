import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { listProjects } from "@/app/(app)/intake/project-actions";
import { createWorkspaceProjects, useSharedWorkspaceProjects, WorkspaceProjectsProvider } from "./workspace-projects-provider";

vi.mock("@/app/(app)/intake/project-actions", () => ({ listProjects: vi.fn() }));
beforeEach(() => vi.mocked(listProjects).mockReset());
const existing = { id: "project-existing", name: "Website", description: null };
const created = { id: "project-created", name: "Brand", description: null };

describe("shared workspace Projects read adapter", () => {
  it("keeps a newly created Project when an overlapping read omits it", async () => {
    const pending = Promise.withResolvers<Awaited<ReturnType<typeof listProjects>>>();
    vi.mocked(listProjects).mockReturnValueOnce(pending.promise);
    const catalogue = createWorkspaceProjects("workspace-a", [existing]);
    const loading = catalogue.getSnapshot().reload();
    catalogue.getSnapshot().add(created);
    pending.resolve({ success: true, projects: [existing] });
    await loading;
    expect(catalogue.getSnapshot()).toMatchObject({ entries: [created, existing], loading: false, error: null });
  });

  it("ignores an older response after a newer reload finishes", async () => {
    const older = Promise.withResolvers<Awaited<ReturnType<typeof listProjects>>>();
    const newer = Promise.withResolvers<Awaited<ReturnType<typeof listProjects>>>();
    vi.mocked(listProjects).mockReturnValueOnce(older.promise).mockReturnValueOnce(newer.promise);
    const catalogue = createWorkspaceProjects("workspace-a", [existing]);
    const a = catalogue.getSnapshot().reload(), b = catalogue.getSnapshot().reload();
    newer.resolve({ success: true, projects: [created] });
    await b;
    older.resolve({ success: true, projects: [existing] });
    await a;
    expect(catalogue.getSnapshot()).toMatchObject({ entries: [created], loading: false, error: null });
  });

  it("retains usable Projects on failure and clears the error while retrying", async () => {
    vi.mocked(listProjects).mockResolvedValueOnce({ success: false, error: { code: "load_failed", message: "Projects unavailable" } });
    const catalogue = createWorkspaceProjects("workspace-a", [existing]);
    await catalogue.getSnapshot().reload();
    expect(catalogue.getSnapshot()).toMatchObject({ entries: [existing], loading: false, error: "Projects unavailable" });
    const pending = Promise.withResolvers<Awaited<ReturnType<typeof listProjects>>>();
    vi.mocked(listProjects).mockReturnValueOnce(pending.promise);
    const retry = catalogue.getSnapshot().reload();
    expect(catalogue.getSnapshot()).toMatchObject({ loading: true, error: null });
    pending.resolve({ success: true, projects: [created] });
    await retry;
    expect(catalogue.getSnapshot()).toMatchObject({ entries: [created], loading: false, error: null });
  });

  it("uses an acknowledged server Project and retires local protection", async () => {
    const catalogue = createWorkspaceProjects("workspace-a", [existing]);
    catalogue.getSnapshot().add(created);
    const acknowledged = { ...created, name: "Brand renamed" };
    vi.mocked(listProjects).mockResolvedValueOnce({ success: true, projects: [existing, acknowledged] });
    await catalogue.getSnapshot().reload();
    expect(catalogue.getSnapshot().entries).toEqual([acknowledged, existing]);
    vi.mocked(listProjects).mockResolvedValueOnce({ success: true, projects: [existing] });
    await catalogue.getSnapshot().reload();
    expect(catalogue.getSnapshot().entries).toEqual([existing]);
  });
  it("sorts Projects by name then saved ID without changing the server seed", () => {
    const catalogue = createWorkspaceProjects("workspace-a", [existing]);
    const b = { id: "b", name: "Alpha", description: null }, a = { id: "a", name: "Alpha", description: null };
    catalogue.getSnapshot().add(b); catalogue.getSnapshot().add(a);
    expect(catalogue.getSnapshot().entries).toEqual([a, b, existing]);
    function Reader() {
      const projects = useSharedWorkspaceProjects();
      return `${projects.orgId}:${projects.projects.map(project => project.name).join(",")}:${projects.loading}:${projects.error}`;
    }
    expect(renderToStaticMarkup(createElement(WorkspaceProjectsProvider, { orgId: "workspace-a", initialProjects: [existing] }, createElement(Reader)))).toBe("workspace-a:Website:false:null");
    expect(listProjects).not.toHaveBeenCalled();
  });
});
