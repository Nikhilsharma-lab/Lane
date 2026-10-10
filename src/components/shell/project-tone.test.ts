import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { WorkspaceSidebar } from "@/components/arc/blocks/workspace-sidebar/workspace-sidebar";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

const arcTones = ["blue", "green", "violet", "amber", "coral", "slate"];

function renderedTone(id: string, name = "Project") {
  const html = renderToStaticMarkup(createElement(WorkspaceSidebar, {
    workspace: { id: "workspace", name: "Lane", initial: "L" },
    user: { name: "Test Member", email: "member@example.test" },
    settingsHref: "/settings/profile",
    projects: [{ id, name, href: `/?project=${id}` }],
    groups: [],
    activeId: id,
    currentPage: "Requests",
  }));
  return html.match(/data-tone="([^"]+)"/)?.[1];
}

describe("workspace project markers", () => {
  it("uses Arc tones that stay with a Project when its name or list position changes", () => {
    const ids = Array.from({ length: 12 }, (_, index) =>
      `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
    );
    const tones = ids.map(id => renderedTone(id));

    expect(tones.every(tone => arcTones.includes(tone ?? ""))).toBe(true);
    expect(new Set(tones).size).toBeGreaterThan(1);
    expect(renderedTone(ids[0], "Renamed Project")).toBe(tones[0]);
    expect(ids.toReversed().map(id => renderedTone(id)).toReversed()).toEqual(tones);
  });
});
