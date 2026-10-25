/**
 * #213: the Free Requests rules, given a workspace's billing state. Four Free Requests, then creating a new Request
 * (or taking on a Guest submission) is blocked with "an Admin needs to pay", but only while billing is enforced.
 */
import { describe, expect, it } from "vitest";
import { allowanceKeyOf, creationBlock, freeRequestsOf, type FreeRequestsState } from "./free-request-rules";

const held = { kind: "company_domain" as const, domain: "acme.com", held: true };
const state = (change: Partial<FreeRequestsState> = {}): FreeRequestsState => ({ planState: "free", used: 0, allowance: held, ...change });
const PAY = "An Admin needs to pay for Lane before anyone here can create a new Request or take on a Guest submission. Everything already filed keeps working.";

describe("Free Requests left", () => {
  it("gives a new workspace 4", () => {
    expect(freeRequestsOf(state())).toEqual({ total: 4, used: 0, left: 4, usedElsewhere: null });
    expect(freeRequestsOf(state({ used: 3 }))).toMatchObject({ left: 1 });
    expect(freeRequestsOf(state({ used: 9 }))).toMatchObject({ total: 4, used: 9, left: 0 });
  });

  it("gives none to a second workspace from the same company domain, and says where they went", () => {
    const second = state({ allowance: { kind: "company_domain", domain: "acme.com", held: false } });
    expect(freeRequestsOf(second)).toEqual({ total: 0, used: 0, left: 0, usedElsewhere: { kind: "company_domain", domain: "acme.com" } });
  });

  it("gives 4 while the allowance isn't decided yet, so nobody is blocked on Lane's own uncertainty", () => {
    expect(freeRequestsOf(state({ allowance: null }))).toMatchObject({ total: 4, left: 4, usedElsewhere: null });
  });
});

describe("the block on new Requests", () => {
  it("lets the first 4 through and blocks the 5th, saying an Admin needs to pay", () => {
    for (const used of [0, 1, 2, 3]) expect(creationBlock(state({ used }), { enforced: true })).toBeNull();
    expect(creationBlock(state({ used: 4 }), { enforced: true })).toBe(`This workspace has used its 4 Free Requests. ${PAY}`);
  });

  it("tells a second workspace from the same domain that the Free Requests were already used", () => {
    expect(creationBlock(state({ allowance: { kind: "company_domain", domain: "acme.com", held: false } }), { enforced: true }))
      .toBe(`The Free Requests for acme.com were already used by another workspace. ${PAY}`);
    expect(creationBlock(state({ allowance: { kind: "personal_email", domain: "gmail.com", held: false } }), { enforced: true }))
      .toBe(`The person who created this workspace already used their Free Requests in another workspace. ${PAY}`);
  });

  it("never blocks a paying workspace, and blocks a lapsed one", () => {
    expect(creationBlock(state({ used: 40, planState: "paying" }), { enforced: true })).toBeNull();
    expect(creationBlock(state({ used: 1, planState: "lapsed" }), { enforced: true })).toBe(`This workspace’s plan has lapsed. ${PAY}`);
  });

  it("blocks nothing while billing isn't enforced", () => {
    expect(creationBlock(state({ used: 40 }), { enforced: false })).toBeNull();
    expect(creationBlock(state({ planState: "lapsed" }), { enforced: false })).toBeNull();
    expect(creationBlock(state({ allowance: { kind: "company_domain", domain: "acme.com", held: false } }), { enforced: false })).toBeNull();
  });
});

describe("whose allowance a creator's email address names", () => {
  it("names the company domain for a work address", () => {
    expect(allowanceKeyOf("Ana@Acme.COM")).toEqual({ key: "acme.com", kind: "company_domain", domain: "acme.com" });
    expect(allowanceKeyOf(" ben@design.acme.co.uk ")).toEqual({ key: "design.acme.co.uk", kind: "company_domain", domain: "design.acme.co.uk" });
  });

  it("names the person for a personal email domain, however the address is spelled", () => {
    expect(allowanceKeyOf("ana@gmail.com")).toEqual({ key: "ana@gmail.com", kind: "personal_email", domain: "gmail.com" });
    expect(allowanceKeyOf("A.Na+lane@GMail.com")).toEqual({ key: "ana@gmail.com", kind: "personal_email", domain: "gmail.com" });
    expect(allowanceKeyOf("ana@googlemail.com")).toMatchObject({ key: "ana@gmail.com" });
    expect(allowanceKeyOf("bo.b+work@outlook.com")).toMatchObject({ key: "bo.b@outlook.com", kind: "personal_email" });
    for (const domain of ["yahoo.com", "hotmail.com", "icloud.com", "proton.me", "aol.com"]) expect(allowanceKeyOf(`x@${domain}`)).toMatchObject({ kind: "personal_email" });
  });

  it("names nothing for something that isn't an email address", () => {
    for (const value of ["", "nobody", "@acme.com", "ana@", "ana@localhost", "a@b@acme.com"]) expect(allowanceKeyOf(value)).toBeNull();
  });
});
