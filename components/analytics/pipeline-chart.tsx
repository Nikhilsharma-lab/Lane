"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";

const PHASE_COLORS: Record<string, string> = {
  predesign: "#D4A84B",
  design: "#A394C7",
  dev: "#7DA5C4",
  track: "#86A87A",
};

const chartConfig: ChartConfig = {
  predesign: { label: "Predesign", color: "#D4A84B" },
  design: { label: "Design", color: "#A394C7" },
  dev: { label: "Dev", color: "#7DA5C4" },
  track: { label: "Track", color: "#86A87A" },
};

interface PipelineChartProps {
  data: { phase: string; count: number }[];
}

export function PipelineChart({ data }: PipelineChartProps) {
  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center h-48 text-xs text-[var(--text-tertiary)]">
        No pipeline data yet
      </div>
    );
  }

  return (
    <ChartContainer config={chartConfig} className="h-48 w-full">
      <BarChart
        data={data}
        layout="vertical"
        margin={{ top: 0, right: 16, bottom: 0, left: 0 }}
      >
        <XAxis type="number" hide />
        <YAxis
          type="category"
          dataKey="phase"
          width={72}
          tick={{ fontSize: 11, fill: "var(--text-secondary)" }}
          tickFormatter={(v: string) =>
            v.charAt(0).toUpperCase() + v.slice(1)
          }
          axisLine={false}
          tickLine={false}
        />
        <ChartTooltip content={<ChartTooltipContent hideLabel />} />
        <Bar dataKey="count" radius={[0, 4, 4, 0]} barSize={20}>
          {data.map((entry) => (
            <Cell
              key={entry.phase}
              fill={PHASE_COLORS[entry.phase] ?? "#71717a"}
            />
          ))}
        </Bar>
      </BarChart>
    </ChartContainer>
  );
}
