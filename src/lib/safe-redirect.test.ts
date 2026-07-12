import { describe, expect, it } from "vitest";
import { inviteTokenFromPath, safeRedirectPath } from "./safe-redirect";

describe("safeRedirectPath", () => {
  it.each([
    ["/", "/"],
    ["/invite/abc?source=email", "/invite/abc?source=email"],
    ["/requests/123#comments", "/requests/123#comments"],
  ])("keeps internal path %s", (value, expected) => {
    expect(safeRedirectPath(value)).toBe(expected);
  });

  it.each([
    [null],
    ["https://evil.example"],
    ["//evil.example"],
    ["/\\evil.example"],
    ["/%5cevil.example"],
    ["javascript:alert(1)"],
    ["/safe\nSet-Cookie: bad"],
  ])("rejects unsafe redirect %s", (value) => {
    expect(safeRedirectPath(value)).toBe("/");
  });
});

describe("inviteTokenFromPath", () => {
  it("extracts only an exact invite path", () => {
    expect(inviteTokenFromPath("/invite/token-123")).toBe("token-123");
    expect(inviteTokenFromPath("/invite/token-123/extra")).toBeNull();
    expect(inviteTokenFromPath("/requests/token-123")).toBeNull();
  });
});
