import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// #407: a Reviewers row shows a name over an email, and a long email wraps. Each picker that needs a taller row
// set `height: auto` against the shared row's fixed height, at the same specificity, so the stylesheet that loaded
// last decided. When the shared row's came last (a later chunk imports it: the Metric picker, the intake form), every
// row went back to one line's height, the emails spilled into the rows below, and a press picked the neighbour.
const css = (file: string) => readFileSync(join(process.cwd(), "src/components/requests", file), "utf8");
const declarations = (source: string, selector: string) => {
  const block = new RegExp(`(?:^|\\n)${selector.replace(".", "\\.")}\\s*\\{([^}]*)\\}`).exec(source)?.[1];
  if (block === undefined) throw new Error(`${selector} not found`);
  return Object.fromEntries(block.split(";").map(line => line.trim()).filter(Boolean).map(line => {
    const at = line.indexOf(":");
    return [line.slice(0, at).trim(), line.slice(at + 1).trim()];
  }));
};

describe("a picker row", () => {
  it("is at least one menu row high and grows with what it holds, whichever stylesheet loads last", () => {
    const row = declarations(css("request-picker-layout.module.css"), ".row");
    expect(row["min-height"]).toBe("var(--menu-row-height)");
    expect(row).not.toHaveProperty("height");
  });

  it("lets a reviewer's email wrap inside the row rather than past it", () => {
    const pickers = css("request-property-pickers.module.css");
    expect(pickers).toMatch(/\.projectOption \.optionContent > span \{[^}]*white-space: normal;[^}]*overflow-wrap: anywhere;/);
    expect(declarations(pickers, ".optionDetails")).toMatchObject({ display: "grid", "min-width": "0" });
  });
});
