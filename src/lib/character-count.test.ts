import { describe, expect, it } from "vitest";
import { charactersLeftNote } from "./character-count";

// Polish bar §13 (A110): a field shows how much room is left only as its text nears the limit.
describe("charactersLeftNote", () => {
  it("says nothing while the text is well inside the limit", () => {
    expect(charactersLeftNote("", 80)).toBeUndefined();
    expect(charactersLeftNote("a".repeat(63), 80)).toBeUndefined();
  });
  it("counts down over the last fifth of the limit", () => {
    expect(charactersLeftNote("a".repeat(64), 80)).toBe("16 characters left");
    expect(charactersLeftNote("a".repeat(79), 80)).toBe("1 character left");
    expect(charactersLeftNote("a".repeat(80), 80)).toBe("No characters left");
  });
  it("gives a short limit at least ten characters of warning", () => {
    expect(charactersLeftNote("a".repeat(29), 40)).toBeUndefined();
    expect(charactersLeftNote("a".repeat(30), 40)).toBe("10 characters left");
  });
});
