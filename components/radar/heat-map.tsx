import Link from "next/link";
import type { PhaseHeatMap } from "@/lib/radar";

const PHASE_LABELS: Record<keyof PhaseHeatMap, string> = {
  predesign: "Predesign",
  design: "Design",
  dev: "Dev",
  track: "Track",
};

export function HeatMap({ heatMap }: { heatMap: PhaseHeatMap }) {
  const phases = ["predesign", "design", "dev", "track"] as const;
  return (
    <div className="grid grid-cols-4 gap-3">
      {phases.map((phase) => (
        <Link
          key={phase}
          href={`/dashboard?phase=${phase}`}
          className="border rounded-xl px-5 py-4 hover:border-border/80 transition-colors block"
        >
          <p className="text-xs text-muted-foreground mb-1">{PHASE_LABELS[phase]}</p>
          <p className="text-2xl font-semibold text-foreground">{heatMap[phase]}</p>
        </Link>
      ))}
    </div>
  );
}
