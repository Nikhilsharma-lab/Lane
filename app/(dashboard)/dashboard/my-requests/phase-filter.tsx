"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";

const PHASES = [
  { value: "predesign", label: "Predesign" },
  { value: "design", label: "Design" },
  { value: "dev", label: "Build" },
  { value: "track", label: "Track" },
] as const;

export function PhaseFilter({
  activePhase,
}: {
  activePhase: string | null;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function setPhase(phase: string | null) {
    const params = new URLSearchParams(searchParams.toString());
    if (phase) {
      params.set("phase", phase);
    } else {
      params.delete("phase");
    }
    const query = params.toString();
    router.push(query ? `${pathname}?${query}` : pathname);
  }

  return (
    <div className="flex gap-1">
      <button
        type="button"
        onClick={() => setPhase(null)}
        className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
          !activePhase
            ? "bg-primary text-primary-foreground"
            : "bg-muted text-muted-foreground hover:text-foreground"
        }`}
      >
        All
      </button>
      {PHASES.map((phase) => (
        <button
          key={phase.value}
          type="button"
          onClick={() =>
            setPhase(activePhase === phase.value ? null : phase.value)
          }
          className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
            activePhase === phase.value
              ? "bg-primary text-primary-foreground"
              : "bg-muted text-muted-foreground hover:text-foreground"
          }`}
        >
          {phase.label}
        </button>
      ))}
    </div>
  );
}
