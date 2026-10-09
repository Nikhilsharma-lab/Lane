import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, within } from "storybook/test";
import { Alert } from "@/components/arc/alert/alert";
import { Badge } from "@/components/arc/badge/badge";
import { PROJECT_TONES } from "@/lib/project-tone";
import projectDot from "@/components/projects/project-dot.module.css";
import { Circle, CircleDot, CircleCheck, Info as InfoIcon, TriangleAlert as TriangleAlertIcon, CircleAlert as CircleAlertIcon } from "lucide-react";

const meta = {
  title: "Review/Utility colours",
  parameters: {
    layout: "fullscreen",
    docs: { description: { component: "Arc badges and alerts in Lane's production semantic colours. Status is always written as text; this fixture does not read workspace data." } },
  },
} satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

// Measure rendered colours, including translucent surfaces over their ancestors.
function contrast(element: Element) {
  const context = document.createElement("canvas").getContext("2d")!;
  const rgba = (value: string) => {
    context.clearRect(0, 0, 1, 1);
    context.fillStyle = value;
    context.fillRect(0, 0, 1, 1);
    return [...context.getImageData(0, 0, 1, 1).data];
  };
  const over = (front: number[], back: number[]) => front.slice(0, 3).map((value, index) => value * front[3] / 255 + back[index] * (1 - front[3] / 255));
  const ancestors: Element[] = [];
  for (let node: Element | null = element; node; node = node.parentElement) ancestors.unshift(node);
  let background = [255, 255, 255];
  for (const node of ancestors) background = over(rgba(getComputedStyle(node).backgroundColor), background);
  const foreground = over(rgba(getComputedStyle(element).color), background);
  const luminance = (rgb: number[]) => rgb.map(value => {
    const channel = value / 255;
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  }).reduce((sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index], 0);
  const levels = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
  return (levels[0] + 0.05) / (levels[1] + 0.05);
}

export const Gallery: Story = {
  render: () => <main className="mx-auto max-w-3xl space-y-8 p-6 sm:p-8">
    <header className="space-y-2"><h1>Utility colours</h1><p>Colour explains state. Labels and icons carry the same meaning.</p></header>
    <section className="space-y-3" aria-labelledby="lifecycle-colours">
      <h2 id="lifecycle-colours">Request status</h2>
      <div className="flex flex-wrap gap-3">
        <Badge data-contrast="text" tone="neutral" icon={<Circle />}>Open</Badge>
        <Badge data-contrast="text" tone="info" icon={<CircleDot />}>In Progress</Badge>
        <Badge data-contrast="text" tone="success" icon={<CircleCheck />}>Done</Badge>
      </div>
    </section>
    <section className="space-y-3" aria-labelledby="project-colours">
      <h2 id="project-colours">Project colours</h2>
      <p>Arc’s category colours identify Projects consistently in the sidebar and Request rows.</p>
      <div className="flex flex-wrap gap-3">
        {PROJECT_TONES.map(tone => <Badge key={tone} tone="neutral" icon={<span className={projectDot.dot} data-tone={tone} aria-hidden="true" />}>
          {tone.charAt(0).toUpperCase() + tone.slice(1)}
        </Badge>)}
      </div>
    </section>
    <section className="space-y-3" aria-labelledby="feedback-colours">
      <h2 id="feedback-colours">Information, attention and feedback</h2>
      <div className="flex flex-wrap gap-3">
        <Badge data-contrast="text" tone="info" icon={<InfoIcon />}>AI suggestion</Badge>
        <Badge data-contrast="text" tone="warning" icon={<TriangleAlertIcon />}>Needs attention</Badge>
        <Badge data-contrast="text" tone="danger" icon={<CircleAlertIcon />}>Upload failed</Badge>
      </div>
      <Alert tone="info" title="Private attachments">Only people with access to this Request can download its files.</Alert>
      <Alert tone="success" title="Role updated">Your access has not changed.</Alert>
      <Alert tone="warning" title="Your draft was restored">Choose any files again before creating the Request.</Alert>
      <Alert tone="danger" title="Request not created">Your text is still here. Try again.</Alert>
    </section>
  </main>,
  play: async ({ canvasElement }) => {
    await document.fonts.ready;
    const canvas = within(canvasElement);
    await expect(canvas.getByText("In Progress")).toBeVisible();
    await expect(canvas.getByRole("alert")).toHaveTextContent("Your text is still here. Try again.");
    const measurements: Record<string, number> = {};
    for (const element of canvasElement.querySelectorAll('[data-contrast="text"], [role="status"] strong, [role="status"] p, [role="alert"] strong, [role="alert"] p')) {
      const name = element.textContent?.trim() ?? "";
      measurements[name] = contrast(element);
      expect(measurements[name], `${name} contrast`).toBeGreaterThanOrEqual(4.5);
    }
    canvasElement.dataset.contrastMeasurements = JSON.stringify(measurements);
    expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(window.innerWidth);
  },
};
