import { beforeEach, describe, expect, it, vi } from "vitest";

// A missing Metric (/settings/metrics/<unknown id>) answers a real 404 on a full page load, as an unknown Request
// does (requests/[id]/layout.tsx). A move inside the app (an RSC request) has no status to set and goes on.
const boundary = vi.hoisted(() => ({ rsc: false, workspace: null as unknown, found: false, reads: 0 }));
vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ headers: async () => new Headers(boundary.rsc ? { rsc: "1" } : {}) }));
vi.mock("next/navigation", () => ({ notFound: () => { throw new Error("not-found"); } }));
vi.mock("@/lib/ensure-workspace", () => ({ getWorkspace: async () => boundary.workspace }));
vi.mock("@/lib/data/metric-page", () => ({ readMetricPage: async () => { boundary.reads += 1; return boundary.found ? { id: "m" } : null; } }));

const member = { needsOnboarding: false, role: "member", orgId: "org_a", userId: "user_a" };
const open = async (id = "00000000-0000-4000-a000-000000000001") => {
  const { default: MetricLayout } = await import("./layout");
  return MetricLayout({ children: "page", params: Promise.resolve({ id }) });
};

beforeEach(() => { Object.assign(boundary, { rsc: false, workspace: member, found: false, reads: 0 }); });

describe("a Metric's Settings page", () => {
  it("answers 404 on a full load of a Metric that isn't this workspace's", async () => {
    await expect(open()).rejects.toThrow("not-found");
  });
  it("shows a Metric that exists", async () => {
    boundary.found = true;
    expect(await open()).toBe("page");
  });
  it("leaves a move inside the app, and anyone the page itself sends away, to the page", async () => {
    boundary.rsc = true;
    expect(await open()).toBe("page");
    boundary.rsc = false;
    for (const workspace of [null, { needsOnboarding: true }, { ...member, role: "guest" }]) {
      boundary.workspace = workspace;
      expect(await open()).toBe("page");
    }
    expect(boundary.reads).toBe(0);
  });
});
