import { describe, it, expect } from "vitest";
import { getActiveNavItem } from "@/lib/nav/active-item";

describe("getActiveNavItem", () => {
  // ── Personal zone ───────────────────────────────────────────────────────

  it("inbox root", () => {
    expect(getActiveNavItem("/dashboard/inbox")).toBe("inbox");
  });

  it("inbox item detail stays on inbox (triage flow)", () => {
    expect(getActiveNavItem("/dashboard/inbox/msg-123")).toBe("inbox");
  });

  it("my streams list", () => {
    expect(getActiveNavItem("/dashboard/streams")).toBe("my_streams");
  });

  it("drafts", () => {
    expect(getActiveNavItem("/dashboard/drafts")).toBe("drafts");
  });

  it("saved", () => {
    expect(getActiveNavItem("/dashboard/saved")).toBe("saved");
  });

  it("idea board", () => {
    expect(getActiveNavItem("/dashboard/ideas")).toBe("idea_board");
  });

  it("weekly report", () => {
    expect(getActiveNavItem("/dashboard/report")).toBe("report");
  });

  // ── Cross-team views ──────────────────────────────────────────────────

  it("cross-team view list", () => {
    expect(getActiveNavItem("/dashboard/views/validation")).toBe("cross_team_view");
  });

  it("cross-team stalled view", () => {
    expect(getActiveNavItem("/dashboard/views/stalled")).toBe("cross_team_view");
  });

  // ── Stream detail → canonical team location ───────────────────────────

  it("stream detail with context → team active streams", () => {
    expect(
      getActiveNavItem("/dashboard/streams/stream-abc", {
        teamSlug: "consumer-app",
      }),
    ).toBe("team:consumer-app:active_streams");
  });

  it("stream detail from different team → that team's active streams", () => {
    expect(
      getActiveNavItem("/dashboard/streams/stream-xyz", {
        teamSlug: "platform",
      }),
    ).toBe("team:platform:active_streams");
  });

  it("stream detail WITHOUT context → falls back to my_streams", () => {
    expect(getActiveNavItem("/dashboard/streams/stream-abc")).toBe("my_streams");
  });

  // ── Team-scoped pages ─────────────────────────────────────────────────

  it("team active streams", () => {
    expect(getActiveNavItem("/dashboard/teams/consumer-app/streams")).toBe(
      "team:consumer-app:active_streams",
    );
  });

  it("team intake queue", () => {
    expect(getActiveNavItem("/dashboard/teams/consumer-app/intake")).toBe(
      "team:consumer-app:intake_queue",
    );
  });

  it("team commitments", () => {
    expect(getActiveNavItem("/dashboard/teams/platform/commitments")).toBe(
      "team:platform:commitments",
    );
  });

  it("team validation gate", () => {
    expect(getActiveNavItem("/dashboard/teams/consumer-app/validation")).toBe(
      "team:consumer-app:validation_gate",
    );
  });

  it("team archive", () => {
    expect(getActiveNavItem("/dashboard/teams/platform/archive")).toBe(
      "team:platform:archive",
    );
  });

  // ── Fallback ──────────────────────────────────────────────────────────

  it("unknown path → my_streams", () => {
    expect(getActiveNavItem("/dashboard/something-else")).toBe("my_streams");
  });

  it("root dashboard → my_streams", () => {
    expect(getActiveNavItem("/dashboard")).toBe("my_streams");
  });
});
