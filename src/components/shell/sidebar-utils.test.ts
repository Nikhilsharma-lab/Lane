import { describe, it, expect } from "vitest";
import { initials, NAV_MATCHERS } from "./sidebar-utils";

describe("initials", () => {
  it("extracts two initials from a full name", () => {
    expect(initials("Nikhil Sharma")).toBe("NS");
  });

  it("extracts one initial from a single name", () => {
    expect(initials("Nikhil")).toBe("N");
  });

  it("takes at most two initials", () => {
    expect(initials("Jean Claude Van Damme")).toBe("JC");
  });

  it("uppercases lowercase input", () => {
    expect(initials("nikhil sharma")).toBe("NS");
  });

  it("returns empty string for empty input", () => {
    expect(initials("")).toBe("");
  });
});

describe("NAV_MATCHERS.requests", () => {
  it("matches the root path", () => {
    expect(NAV_MATCHERS.requests("/")).toBe(true);
  });

  it("matches /intake", () => {
    expect(NAV_MATCHERS.requests("/intake")).toBe(true);
  });

  it("matches /requests/[id]", () => {
    expect(NAV_MATCHERS.requests("/requests/abc-123")).toBe(true);
  });

  it("matches /requests exactly", () => {
    expect(NAV_MATCHERS.requests("/requests")).toBe(true);
  });

  it("does not match /settings", () => {
    expect(NAV_MATCHERS.requests("/settings")).toBe(false);
  });

  it("does not match /settings/members", () => {
    expect(NAV_MATCHERS.requests("/settings/members")).toBe(false);
  });
});

describe("NAV_MATCHERS.settings", () => {
  it("matches /settings", () => {
    expect(NAV_MATCHERS.settings("/settings")).toBe(true);
  });

  it("matches /settings/members", () => {
    expect(NAV_MATCHERS.settings("/settings/members")).toBe(true);
  });

  it("matches /settings/profile", () => {
    expect(NAV_MATCHERS.settings("/settings/profile")).toBe(true);
  });

  it("does not match the root", () => {
    expect(NAV_MATCHERS.settings("/")).toBe(false);
  });

  it("does not match /requests", () => {
    expect(NAV_MATCHERS.settings("/requests/abc")).toBe(false);
  });
});
