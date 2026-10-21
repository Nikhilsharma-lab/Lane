import { describe, expect, it } from "vitest";
import { concernMarker, pickupConfirmation } from "./request-agreement";

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

describe("concernMarker", () => {
  it("shows only when at least one concern is open", () => {
    expect(concernMarker(null)).toBeNull();
    expect(concernMarker({ concerns: [], unanswered: 4 })).toBeNull();
    expect(concernMarker({ concerns: [concern], unanswered: 0 })).toBe("1 concern");
    expect(concernMarker({ concerns: [concern, concern], unanswered: 0 })).toBe("2 concerns");
  });
});
