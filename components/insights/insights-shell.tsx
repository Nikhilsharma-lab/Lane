// components/insights/insights-shell.tsx
"use client";

import { useState } from "react";
import { DigestPanel } from "./digest-panel";
import { PmCalibration } from "./pm-calibration";
import type { WeeklyDigest, PmCoachingNote } from "@/lib/digest";

interface Props {
  initialDigest?: WeeklyDigest | null;
  initialPmCoaching?: PmCoachingNote[] | null;
}

export function InsightsShell({ initialDigest, initialPmCoaching }: Props) {
  const [pmCoaching, setPmCoaching] = useState<PmCoachingNote[] | null>(
    initialPmCoaching ?? null
  );

  return (
    <>
      {/* Weekly digest */}
      <section>
        <h2 className="text-xs font-medium text-[var(--text-secondary)] uppercase tracking-wide mb-4">
          Weekly digest
        </h2>
        <DigestPanel
          initialDigest={initialDigest}
          onCoachingGenerated={setPmCoaching}
        />
      </section>

      {/* PM calibration */}
      <section>
        <h2 className="text-xs font-medium text-[var(--text-secondary)] uppercase tracking-wide mb-4">
          PM calibration
        </h2>
        <PmCalibration coaching={pmCoaching ?? undefined} />
      </section>
    </>
  );
}
