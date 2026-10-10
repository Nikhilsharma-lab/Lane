import { describe, expect, it } from "vitest";
import { formatRequestCode, parseRequestCode } from "./request-code";

describe("saved Request codes", () => {
  it("formats the persisted number without using list position or workspace names", () => {
    expect(formatRequestCode(42)).toBe("LAN-42");
    expect(formatRequestCode(2147483647)).toBe("LAN-2147483647");
  });

  it.each([0, -1, 1.5, NaN, Infinity, 2147483648])("refuses an invalid stored number: %s", (number) => {
    expect(() => formatRequestCode(number)).toThrow();
  });

  it.each(["LAN-42", "lan-42", "  LaN-42  "])("looks up the full case-insensitive code: %s", (query) => {
    expect(parseRequestCode(query)).toBe(42);
  });

  it.each(["42", "LAN-0", "LAN-01", "LAN--1", "LAN-1.5", "LAN-2147483648", "LAN-42 extra", "LAN-4%", "LAN-42\nextra", "LAN-42' OR 1=1 --"])("keeps non-code input as ordinary search text: %s", (query) => {
    expect(parseRequestCode(query)).toBeNull();
  });
});
