import { describe, expect, it } from "vitest";
import { keepShownOrder, localDayRange, requestWithCode, searchLoaded, startOfZonedDay, type WorkspaceSearchRequest } from "./workspace-search";

const request = (id: string, title: string, extra: Partial<WorkspaceSearchRequest> = {}): WorkspaceSearchRequest => ({
  id, title, reframedProblem: null, status: "open", projectId: null, projectName: null, requestType: null, createdAt: "2026-10-01T10:00:00.000Z", ...extra,
});

// Plan item 2.8, decision 4: the created-date filter covers the viewer's local days.
describe("local day boundaries", () => {
  it("starts and ends an IST day at 18:30 UTC the evening before", () => {
    expect(localDayRange("2026-10-20", "2026-10-20", "Asia/Kolkata")).toEqual({
      createdSince: "2026-10-19T18:30:00.000Z",
      createdBefore: "2026-10-20T18:30:00.000Z",
    });
  });

  it("includes a Request created at 00:30 IST and excludes one from 23:59 IST the day before", () => {
    const { createdSince, createdBefore } = localDayRange("2026-10-20", "2026-10-20", "Asia/Kolkata");
    const source = { requests: [
      request("early", "Checkout", { createdAt: "2026-10-19T19:00:00.000Z" }), // 00:30 IST on 20 Oct, still 19 Oct in UTC
      request("late", "Checkout", { createdAt: "2026-10-19T18:29:00.000Z" }), // 23:59 IST on 19 Oct
      request("last", "Checkout", { createdAt: "2026-10-20T18:29:59.000Z" }), // 23:59:59 IST on 20 Oct, already "tomorrow" nowhere in UTC
      request("next", "Checkout", { createdAt: "2026-10-20T18:30:00.000Z" }), // 00:00 IST on 21 Oct
    ], projects: [] };
    expect(searchLoaded(source, { query: "checkout", createdSince, createdBefore }).requests.map(item => item.id).sort()).toEqual(["early", "last"]);
  });

  it("spans whole days across a range and a daylight-saving change", () => {
    expect(localDayRange("2026-10-01", "2026-10-31", "Asia/Kolkata")).toEqual({ createdSince: "2026-09-30T18:30:00.000Z", createdBefore: "2026-10-31T18:30:00.000Z" });
    // New York leaves daylight saving on 1 November 2026: that day is 25 hours long.
    expect(startOfZonedDay("2026-11-01", "America/New_York").toISOString()).toBe("2026-11-01T04:00:00.000Z");
    expect(startOfZonedDay("2026-11-02", "America/New_York").toISOString()).toBe("2026-11-02T05:00:00.000Z");
    expect(localDayRange("2026-10-20", "2026-10-20", "UTC")).toEqual({ createdSince: "2026-10-20T00:00:00.000Z", createdBefore: "2026-10-21T00:00:00.000Z" });
  });

  it("starts a day whose midnight a daylight-saving change skips at 01:00, never in the day before", () => {
    // Santiago springs forward at midnight on 6 September 2026: 00:00 to 00:59 never happen.
    expect(startOfZonedDay("2026-09-06", "America/Santiago").toISOString()).toBe("2026-09-06T04:00:00.000Z");
    expect(localDayRange("2026-09-05", "2026-09-05", "America/Santiago")).toEqual({ createdSince: "2026-09-05T04:00:00.000Z", createdBefore: "2026-09-06T04:00:00.000Z" });
    // Havana on 8 March 2026 and Beirut on 29 March 2026 skip midnight too.
    expect(startOfZonedDay("2026-03-08", "America/Havana").toISOString()).toBe("2026-03-08T05:00:00.000Z");
    expect(startOfZonedDay("2026-03-29", "Asia/Beirut").toISOString()).toBe("2026-03-28T22:00:00.000Z");
    // Santiago falls back at midnight on 5 April 2026: the day starts at the one 00:00 that follows.
    expect(startOfZonedDay("2026-04-05", "America/Santiago").toISOString()).toBe("2026-04-05T04:00:00.000Z");
  });

  it("rejects a value that is not a calendar day", () => {
    expect(() => localDayRange("20 Oct", "2026-10-20", "Asia/Kolkata")).toThrow(RangeError);
  });
});

describe("instant local matches", () => {
  const source = {
    requests: [
      request("a", "Checkout delivery dates", { requestNumber: 3, createdAt: "2026-10-03T00:00:00.000Z" }),
      request("b", "Signup", { requestNumber: 12, createdAt: "2026-10-01T00:00:00.000Z", reframedProblem: "People abandon checkout" }),
      request("c", "checkout", { requestNumber: 7, createdAt: "2026-09-01T00:00:00.000Z", status: "done", requestType: "bug" }),
      request("d", "Website copy", { requestNumber: 120, createdAt: "2026-10-05T00:00:00.000Z" }),
    ],
    projects: [{ id: "p1", name: "Checkout", description: null }, { id: "p2", name: "Website", description: "checkout pages" }],
  };

  it("ranks an exact saved code first, case-insensitively, and never a partial code", () => {
    expect(searchLoaded(source, { query: " lan-12 " }).requests.map(item => item.id)).toEqual(["b"]);
    expect(searchLoaded(source, { query: "LAN-1" }).requests).toEqual([]);
  });

  it("orders like the server's Best match: exact title, title words, then the rest, newest first", () => {
    expect(searchLoaded(source, { query: "Checkout" }).requests.map(item => item.id)).toEqual(["c", "a", "b"]);
    expect(searchLoaded(source, { query: "checkout", sort: "newest" }).requests.map(item => item.id)).toEqual(["a", "b", "c"]);
    expect(searchLoaded(source, { query: "checkout", sort: "title" }).requests.map(item => item.id)).toEqual(["c", "a", "b"]);
  });

  it("applies the status and type filters and drops Projects when either is set", () => {
    expect(searchLoaded(source, { query: "checkout", statuses: ["done"] })).toEqual({ requests: [source.requests[2]], projects: [] });
    expect(searchLoaded(source, { query: "checkout", types: ["none"] }).requests.map(item => item.id)).toEqual(["a", "b"]);
    expect(searchLoaded(source, { query: "checkout" }).projects.map(item => item.id)).toEqual(["p1"]);
  });

  it("matches nothing for a blank query", () => {
    expect(searchLoaded(source, { query: "  " })).toEqual({ requests: [], projects: [] });
  });

  it("finds the Request a typed code names, in the first source that has it", () => {
    expect(requestWithCode("lan-120", source.requests)?.id).toBe("d");
    expect(requestWithCode("LAN-9", source.requests, [request("z", "Elsewhere", { requestNumber: 9 })])?.id).toBe("z");
    expect(requestWithCode("Website", source.requests)).toBeNull();
  });
});

describe("server results after local matches", () => {
  const page = (ids: string[], hasMore = false) => ({ items: ids.map(id => ({ id })), total: ids.length, page: 0, hasMore });

  it("keeps the shown rows in place and adds the server's other rows below them", () => {
    expect(keepShownOrder(["c", "a"], page(["a", "x", "c", "y"])).items.map(item => item.id)).toEqual(["c", "a", "x", "y"]);
  });

  it("drops shown rows the server did not return and keeps its order when nothing was shown", () => {
    expect(keepShownOrder(["gone", "a"], page(["x", "a"])).items.map(item => item.id)).toEqual(["a", "x"]);
    expect(keepShownOrder([], page(["x", "a"])).items.map(item => item.id)).toEqual(["x", "a"]);
  });

  it("uses the server's copy of a kept row", () => {
    const result = keepShownOrder(["a"], { items: [{ id: "a", title: "Server" }], total: 1, page: 0, hasMore: false });
    expect(result.items[0]).toEqual({ id: "a", title: "Server" });
  });
});
