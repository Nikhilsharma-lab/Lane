import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, userEvent, waitFor, within } from "storybook/test";
import { SlidersHorizontal } from "lucide-react";
import { useState } from "react";
import { FilterMenu, type FilterChip } from "@/components/arc/filter-toolbar/filter-toolbar";

function Fixture() {
  const [selected, setSelected] = useState<FilterChip | null>(null);
  return <>
    <FilterMenu fields={[{ id: "status", label: "Status", options: ["Open", "In Progress", "Done"] }]} triggerIcon={<SlidersHorizontal size={16} aria-hidden="true" />} onSelect={setSelected} />
    <output aria-label="Selected filter">{selected ? `${selected.label}: ${selected.value}` : "None"}</output>
  </>;
}

const meta = {
  title: "Navigation/Filter menu motion",
  component: FilterMenu,
  args: { fields: [], onSelect: () => {} },
  render: () => <Fixture />,
  parameters: { layout: "padded" },
} satisfies Meta<typeof FilterMenu>;
export default meta;
type Story = StoryObj<typeof meta>;

// Sample painted corner geometry during the transition, not just its correct final frame.
// A spring from the 9999px pill token can overshoot below zero and flash square corners.
function sampleCorners(surface: HTMLElement) {
  const samples: number[] = [];
  const started = performance.now();
  return new Promise<number[]>(resolve => {
    const sample = () => {
      const style = getComputedStyle(surface);
      const box = surface.getBoundingClientRect();
      for (const radius of [style.borderTopLeftRadius, style.borderTopRightRadius, style.borderBottomLeftRadius, style.borderBottomRightRadius]) {
        samples.push(Math.min(Number.parseFloat(radius), box.width / 2, box.height / 2));
      }
      if (performance.now() - started >= 700) resolve(samples);
      else requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  });
}

export const CornersStayRoundedDuringOpening: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const trigger = canvas.getByRole("button", { name: "Add filter" });
    const panel = canvasElement.querySelector<HTMLElement>('[role="dialog"]')!;
    const surface = panel.parentElement!;
    const opening = sampleCorners(surface);
    await userEvent.click(trigger);
    const openingCorners = await opening;
    await expect(Math.min(...openingCorners)).toBeGreaterThan(0);
    // The edge should move directly between the circle and panel, without inflating into a capsule.
    await expect(Math.max(...openingCorners)).toBeLessThanOrEqual(Math.max(openingCorners[0], openingCorners.at(-1)!) + 1);
    await userEvent.keyboard("{ArrowDown}{ArrowRight}");
    await waitFor(() => expect(canvas.getByRole("menuitemradio", { name: "Open" })).toHaveFocus());
    await userEvent.keyboard("{ArrowDown}{Enter}");
    await expect(canvas.getByLabelText("Selected filter")).toHaveTextContent("Status: In Progress");
    await expect(trigger).toHaveFocus();
    await waitFor(() => expect(canvas.queryByRole("dialog")).not.toBeInTheDocument());
  },
};
