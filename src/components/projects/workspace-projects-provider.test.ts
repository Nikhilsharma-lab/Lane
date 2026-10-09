import { describe, expect, it } from "vitest";

import {
  initialWorkspaceProjectsState,
  workspaceProjectsReducer,
} from "./workspace-projects-provider";

const existing = { id: "project-existing", name: "Website", description: null };
const created = { id: "project-created", name: "Brand", description: null };

describe("shared workspace Projects", () => {
  it("keeps a newly created Project when an earlier list response arrives", () => {
    let state = workspaceProjectsReducer(initialWorkspaceProjectsState, {
      type: "load-started", requestId: 1,
    });
    state = workspaceProjectsReducer(state, { type: "project-added", project: created });
    state = workspaceProjectsReducer(state, {
      type: "load-succeeded", requestId: 1, projects: [existing],
    });

    expect(state.projects).toEqual([created, existing]);
    expect(state.loading).toBe(false);
    expect(state.error).toBeNull();
  });

  it("ignores an older response after a newer reload finishes", () => {
    let state = workspaceProjectsReducer(initialWorkspaceProjectsState, {
      type: "load-started", requestId: 1,
    });
    state = workspaceProjectsReducer(state, { type: "load-started", requestId: 2 });
    state = workspaceProjectsReducer(state, {
      type: "load-succeeded", requestId: 2, projects: [created],
    });

    expect(workspaceProjectsReducer(state, {
      type: "load-succeeded", requestId: 1, projects: [existing],
    })).toBe(state);
    expect(workspaceProjectsReducer(state, {
      type: "load-failed", requestId: 1, error: "Older request failed",
    })).toBe(state);
    expect(state.projects).toEqual([created]);
  });

  it("reports the latest load error and allows retry", () => {
    let state = workspaceProjectsReducer(initialWorkspaceProjectsState, {
      type: "load-started", requestId: 1,
    });
    state = workspaceProjectsReducer(state, {
      type: "load-failed", requestId: 1, error: "Projects unavailable",
    });
    expect(state).toMatchObject({ loading: false, error: "Projects unavailable" });

    state = workspaceProjectsReducer(state, { type: "load-started", requestId: 2 });
    expect(state).toMatchObject({ loading: true, error: null });
  });
});
