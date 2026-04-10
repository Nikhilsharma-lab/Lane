"use client";

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Cell } from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";

const chartConfig: ChartConfig = {
  completed: { label: "Completed", color: "#2E5339" },
  total: { label: "Total", color: "var(--bg-hover)" },
};

interface CycleThroughputChartProps {
  data: { cycleName: string; completed: number; total: number }[];
}

export function CycleThroughputChart({ data }: CycleThroughputChartProps) {
  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center h-48 text-xs text-[var(--text-tertiary)]">
        No cycle throughput data yet
      </div>
    );
  }

  return (
    <ChartContainer config={chartConfig} className="h-56 w-full">
      <BarChart
        data={data}
        margin={{ top: 8, right: 16, bottom: 0, left: 0 }}
      >
        <CartesianGrid
          strokeDasharray="3 3"
          stroke="var(--border)"
          vertical={false}
        />
        <XAxis
          dataKey="cycleName"
          tick={{ fontSize: 10, fill: "var(--text-tertiary)" }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          tick={{ fontSize: 10, fill: "var(--text-tertiary)" }}
          axisLine={false}
          tickLine={false}
          allowDecimals={false}
        />
        <ChartTooltip content={<ChartTooltipContent />} />
        <Bar
          dataKey="total"
          fill="var(--color-total)"
          radius={[4, 4, 0, 0]}
          barSize={24}
          opacity={0.3}
        />
        <Bar
          dataKey="completed"
          fill="var(--color-completed)"
          radius={[4, 4, 0, 0]}
          barSize={24}
        />
      </BarChart>
    </ChartContainer>
  );
}
