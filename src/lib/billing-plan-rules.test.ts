import { describe, expect, it } from "vitest";
import { BILLING_PERIODS, foundingDiscountFor, foundingEndsAt, paidSeats, seatPrice } from "./billing-plan-rules";

/** #214 (spec #195, item 5): one plan, yearly first, and the founding discount's 40% for two years. */
describe("the Lane plan's prices", () => {
  it("offers yearly first at $30 per seat per month and monthly at $36", () => {
    expect(BILLING_PERIODS).toEqual(["yearly", "monthly"]);
    expect(seatPrice("yearly", false)).toEqual({ price: "$30", list: "$30", discounted: false });
    expect(seatPrice("monthly", false)).toEqual({ price: "$36", list: "$36", discounted: false });
  });

  it("takes 40% off for a founding workspace, shown against the list price", () => {
    expect(seatPrice("yearly", true)).toEqual({ price: "$18", list: "$30", discounted: true });
    expect(seatPrice("monthly", true)).toEqual({ price: "$21.60", list: "$36", discounted: true });
  });
});

describe("the founding discount's two years", () => {
  const now = new Date("2026-10-25T12:00:00Z");

  it("runs a full two years from a workspace's first payment", () => {
    expect(foundingDiscountFor(null, now)).toEqual({ percentOff: 40, months: 24 });
    expect(foundingEndsAt(new Date("2026-10-25T12:00:00Z"))).toEqual(new Date("2028-10-25T12:00:00Z"));
  });

  it("gives a workspace paying again only what is left of its two years, and nothing after", () => {
    expect(foundingDiscountFor(new Date("2025-10-25T12:00:00Z"), now)).toEqual({ percentOff: 40, months: 12 });
    expect(foundingDiscountFor(new Date("2025-10-10T12:00:00Z"), now)).toEqual({ percentOff: 40, months: 12 });
    expect(foundingDiscountFor(new Date("2024-11-01T00:00:00Z"), now)).toEqual({ percentOff: 40, months: 1 });
    expect(foundingDiscountFor(new Date("2024-10-25T12:00:00Z"), now)).toBeNull();
  });
});

describe("paid seats", () => {
  it("counts Admins and Members, never below 3", () => {
    expect(paidSeats(0)).toBe(3);
    expect(paidSeats(2)).toBe(3);
    expect(paidSeats(7)).toBe(7);
  });
});
