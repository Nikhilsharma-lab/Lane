import { describe, expect, it } from "vitest";
import { labelInputSchema, requestLabelKeys, labelRequestType } from "./request-labels";

describe("Request labels", () => {
  it("preserves historical types but allows explicit removal", () => {
    expect(requestLabelKeys({ requestType: "bug" })).toEqual(["bug"]);
    expect(requestLabelKeys({ requestType: "bug", labelKeys: [] })).toEqual([]);
    expect(requestLabelKeys({ requestType: null })).toEqual([]);
  });
  it("keeps the New feature measurement exception when multiple labels are selected", () => {
    expect(labelRequestType(["bug", "new_feature"])).toBe("new_feature");
    expect(labelRequestType(["custom-id"])).toBeNull();
  });
  it("normalizes names and rejects empty names and unsupported colours", () => {
    expect(labelInputSchema.parse({ name: "  Customer   feedback  ", colour: "green" })).toEqual({ name: "Customer feedback", colour: "green" });
    expect(labelInputSchema.safeParse({ name: " ", colour: "green" }).success).toBe(false);
    expect(labelInputSchema.safeParse({ name: "Feedback", colour: "arbitrary-css" }).success).toBe(false);
  });
});
