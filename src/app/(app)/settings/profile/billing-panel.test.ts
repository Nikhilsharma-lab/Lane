/**
 * #287 Settings → Billing for an Admin, as the page composes it: while billing isn't enforced, the pilot line, the
 * plan and then the Free Requests, and the seats and invoices are neither shown nor read; once it is, today's order
 * per plan state. Billing's reads are mocked at the billing module; nothing is rendered past the panel's own parts.
 */
import { isValidElement, type ReactElement, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PlanState } from "@/lib/free-request-rules";

const reads = vi.hoisted(() => ({ planState: "free" as PlanState, seats: vi.fn(), account: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/billing", () => ({
  decideFreeRequests: async () => {},
  readFreeRequests: async () => ({ planState: reads.planState, free: { total: 4, used: 1, left: 3, usedElsewhere: null } }),
  readPlan: async () => ({ planState: reads.planState, period: reads.planState === "paying" ? "yearly" : null, customer: false, subscription: false, endsAt: null, founding: { offered: false, endsAt: null } }),
  readSeats: reads.seats,
  readBillingAccount: reads.account,
}));
vi.mock("@/lib/payment-provider", () => ({ paymentProvider: () => null }));
vi.mock("./billing-form", () => ({ BillingForm: () => null }));

const panel = async (role: "admin" | "member" = "admin") => {
  const { billingPanel } = await import("./billing-panel");
  return billingPanel({ orgId: "org_billing_panel", role });
};
const parts = (node: ReactNode) => (Array.isArray(node) ? node : [node]).filter(isValidElement) as ReactElement<Record<string, unknown>>[];
/** What each part is: the pilot line's words, the plan card, the Free Requests card, or the seats and invoices. */
const names = (node: ReactNode) => parts(node).map(part => part.key === "pilot" ? `pilot: ${part.props.title}` : part.key);

beforeEach(() => {
  reads.planState = "free";
  reads.seats.mockReset().mockResolvedValue({ adminsAndMembers: 2, paid: 3 });
  reads.account.mockReset().mockResolvedValue({ nextBill: null, invoices: [] });
});
afterEach(() => vi.unstubAllEnvs());

describe("Settings → Billing while Lane is free", () => {
  it("says so once, then shows the plan and then the Free Requests", async () => {
    vi.stubEnv("LANE_BILLING_ENFORCED", "");
    expect(names(await panel())).toEqual(["pilot: Lane is free during the pilot. These are the prices once paying starts.", "plan", "free"]);
  });

  it("neither shows nor reads the seats and invoices", async () => {
    vi.stubEnv("LANE_BILLING_ENFORCED", "");
    for (const planState of ["free", "paying", "lapsed"] as const) {
      reads.planState = planState;
      expect(names(await panel())).not.toContain("account");
    }
    expect(reads.seats).not.toHaveBeenCalled();
    expect(reads.account).not.toHaveBeenCalled();
  });

  it("offers the plan with nothing to pay", async () => {
    vi.stubEnv("LANE_BILLING_ENFORCED", "");
    const plan = parts(await panel()).find(part => part.key === "plan");
    expect(plan?.props.checkout).toBe("not_charging");
  });
});

describe("Settings → Billing once billing is enforced", () => {
  it("keeps today's order: Free Requests first, or for a paying workspace its plan, seats and invoices first", async () => {
    vi.stubEnv("LANE_BILLING_ENFORCED", "1");
    expect(names(await panel())).toEqual(["free", "plan", "account"]);
    reads.planState = "paying";
    expect(names(await panel())).toEqual(["plan", "account", "free"]);
    expect(reads.seats).toHaveBeenCalledTimes(2);
  });

  it("is for Admins only", async () => {
    vi.stubEnv("LANE_BILLING_ENFORCED", "1");
    expect(await panel("member")).toBeUndefined();
    expect(reads.seats).not.toHaveBeenCalled();
  });
});
