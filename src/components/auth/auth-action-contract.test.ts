import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const AUTH_ROUTES = join(process.cwd(), "src/app/(auth)");
const AUTH_ACTION = join(
  process.cwd(),
  "src/components/auth/auth-action.tsx"
);

function getTsxFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory()
      ? getTsxFiles(path)
      : entry.name.endsWith(".tsx")
        ? [path]
        : [];
  });
}

describe("Auth and Onboarding action contract", () => {
  it("prevents routes from bypassing the shared semantic action", () => {
    const bypasses = getTsxFiles(AUTH_ROUTES)
      .filter((file) =>
        readFileSync(file, "utf8").includes(
          'from "@/components/ui/button"'
        )
      )
      .map((file) => file.replace(`${process.cwd()}/`, ""));

    expect(bypasses).toEqual([]);
  });

  it("keeps raw buttons limited to selection and account-switch controls", () => {
    const rawButtons = getTsxFiles(AUTH_ROUTES)
      .flatMap((file) => {
        const source = readFileSync(file, "utf8");
        const count = source.match(/<button\b/g)?.length ?? 0;
        return count
          ? [{ file: file.replace(`${process.cwd()}/`, ""), count }]
          : [];
      })
      .sort((a, b) => a.file.localeCompare(b.file));

    expect(rawButtons).toEqual([]);
  });

  it("prevents route-level action geometry and color overrides", () => {
    const overrides = getTsxFiles(AUTH_ROUTES)
      .flatMap((file) => {
        const source = readFileSync(file, "utf8");
        const actions = source.match(/<AuthAction\b[\s\S]*?>/g) ?? [];
        return actions
          .filter((action) =>
            /\b(?:className|size|style|variant)\s*=/.test(action)
          )
          .map(() => file.replace(`${process.cwd()}/`, ""));
      });

    expect(overrides).toEqual([]);
  });

  it("keeps shared action icons on inherited semantic color", () => {
    const source = readFileSync(AUTH_ACTION, "utf8");
    const stateIcon = source.match(/<StateIcon\b[\s\S]*?\/>/)?.[0];

    expect(source).toContain("type LucideIcon");
    expect(source).toContain('from "lucide-react"');
    expect(source).toContain('from "@/components/arc/button/button"');
    expect(source).toContain('"children" | "className" | "size" | "style" | "variant"');
    expect(stateIcon).toBeDefined();
    expect(stateIcon).toContain('data-icon="inline-start"');
    expect(stateIcon).not.toContain("strokeWidth=");
    expect(stateIcon).not.toMatch(/\b(?:color|fill|stroke)\s*=/);
  });

});
