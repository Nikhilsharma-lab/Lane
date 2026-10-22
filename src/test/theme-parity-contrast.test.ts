import { describe, expect, it } from "vitest";
import { contrastRatio } from "../../e2e/theme-parity/contrast";

// Spec #87 Part 2 (#93): the parity test reads painted colours as oklab() strings and checks
// the dark sign-in link against body text by WCAG contrast.
describe("contrastRatio", () => {
  it("measures black on white as 21:1 either way round", () => {
    expect(contrastRatio("oklab(0 0 0)", "oklab(1 0 0)")).toBeCloseTo(21, 2);
    expect(contrastRatio("oklab(1 0 0)", "oklab(0 0 0)")).toBeCloseTo(21, 2);
  });

  it("measures #777777 on white just under the 4.5:1 body-text minimum", () => {
    expect(contrastRatio("oklab(0.5693 0 0)", "oklab(1 0 0)")).toBeCloseTo(4.48, 2);
  });

  it("lays a see-through text colour over its background first", () => {
    // Black at half strength over white paints mid grey (#808080), about 3.98:1, not black's 21:1.
    expect(contrastRatio("oklab(0 0 0 / 0.5)", "oklab(1 0 0)")).toBeCloseTo(3.98, 1);
  });

  it("refuses a value that is not a painted oklab colour", () => {
    expect(() => contrastRatio("red", "oklab(1 0 0)")).toThrow(/oklab/);
  });
});
