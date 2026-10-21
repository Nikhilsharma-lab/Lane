import { describe, expect, it } from "vitest";
import { concernMarker, pickupConfirmation, reviewStateOf } from "./request-reviewer-rules";

// #77: pickup stays one click unless something is outstanding. Every entry
// point (detail button, detail status menu, row menu, bulk bar) asks this.
const concern = { name: "Priya", reason: "The API cannot page this yet." };

describe("pickupConfirmation", () => {
  it("asks nothing when no selected Request has a concern or an unanswered review", () => {
    expect(pickupConfirmation([])).toBeNull();
    expect(pickupConfirmation([{ name: "LAN-1", reviewState: null }])).toBeNull();
    expect(pickupConfirmation([{ name: "LAN-1", reviewState: undefined }, { name: "LAN-2", reviewState: { concerns: [], unanswered: 0 } }])).toBeNull();
  });

  it("lists each concern with who raised it and why, and how many reviews are unanswered", () => {
    expect(pickupConfirmation([{ name: "LAN-4", reviewState: { concerns: [concern], unanswered: 2 } }])).toEqual({
      title: "Pick up anyway?",
      requests: [{ name: "LAN-4", summary: "1 concern open, 2 reviews unanswered", concerns: [concern] }],
    });
    expect(pickupConfirmation([{ name: "LAN-5", reviewState: { concerns: [], unanswered: 1 } }])?.requests).toEqual([
      { name: "LAN-5", summary: "1 review unanswered", concerns: [] },
    ]);
  });

  it("combines every selected Request with something outstanding into one confirmation, leaving out the rest", () => {
    const result = pickupConfirmation([
      { name: "LAN-1", reviewState: { concerns: [concern, { name: "Sam", reason: "No designs yet." }], unanswered: 0 } },
      { name: "LAN-2", reviewState: { concerns: [], unanswered: 0 } },
      { name: "LAN-3", reviewState: { concerns: [], unanswered: 3 } },
    ]);
    expect(result?.title).toBe("Pick up anyway?");
    expect(result?.requests.map(request => [request.name, request.summary])).toEqual([
      ["LAN-1", "2 concerns open"],
      ["LAN-3", "3 reviews unanswered"],
    ]);
  });
});

describe("fresh review state at pickup", () => {
  const waiting = { name: "Sam", decision: null };
  const fine = { name: "Alex", decision: { kind: "looks_good" as const, reason: "" } };
  const worried = { name: "Priya", decision: { kind: "concern" as const, reason: concern.reason } };

  it("reads the reviewers list the way saved reviews are summarised: concerns in order, then the unanswered count", () => {
    expect(reviewStateOf([])).toBeNull();
    expect(reviewStateOf([fine])).toBeNull();
    expect(reviewStateOf([waiting, worried, fine, waiting])).toEqual({ concerns: [concern], unanswered: 2 });
  });

  it("confirms from what the reviewers panel last read, not the older copy the page or preview loaded", () => {
    // A reviewer was just added in the preview: the loaded copy still says nothing is outstanding.
    const added = new Map([["req-1", reviewStateOf([waiting])]]);
    expect(pickupConfirmation([{ id: "req-1", name: "LAN-1", reviewState: null }], added)?.requests).toEqual([
      { name: "LAN-1", summary: "1 review unanswered", concerns: [] },
    ]);
    // Every review was answered Looks good meanwhile: nothing left to confirm.
    const answered = new Map([["req-1", reviewStateOf([fine])]]);
    expect(pickupConfirmation([{ id: "req-1", name: "LAN-1", reviewState: { concerns: [concern], unanswered: 1 } }], answered)).toBeNull();
    // Requests the panel has not read keep their loaded copy.
    expect(pickupConfirmation([{ id: "req-2", name: "LAN-2", reviewState: { concerns: [], unanswered: 1 } }], answered)?.requests).toHaveLength(1);
  });
});

describe("concernMarker", () => {
  const open = "open" as const;
  it("shows on an Open Request only when at least one concern is open", () => {
    expect(concernMarker({ status: open, reviewState: null })).toBeNull();
    expect(concernMarker({ status: open, reviewState: { concerns: [], unanswered: 4 } })).toBeNull();
    expect(concernMarker({ status: open, reviewState: { concerns: [concern], unanswered: 0 } })).toBe("1 concern");
    expect(concernMarker({ status: open, reviewState: { concerns: [concern, concern], unanswered: 0 } })).toBe("2 concerns");
  });

  it("is gone once work has started: the concerns stay on the Request as a record", () => {
    for (const status of ["in_progress", "done"] as const)
      expect(concernMarker({ status, reviewState: { concerns: [concern], unanswered: 1 } })).toBeNull();
  });
});
