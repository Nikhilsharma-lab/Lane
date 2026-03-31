"use client";

import { useState } from "react";
import { EditRequestModal } from "./edit-request-modal";

// Serialized version of Request (Dates as ISO strings for RSC transport)
type SerializedRequest = {
  id: string;
  title: string;
  description: string;
  businessContext: string | null;
  successMetrics: string | null;
  figmaUrl: string | null;
  impactMetric: string | null;
  impactPrediction: string | null;
  deadlineAt: string | null;
  [key: string]: unknown;
};

export function EditRequestButton({ request }: { request: SerializedRequest }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      {open && <EditRequestModal request={request} onClose={() => setOpen(false)} />}
      <button
        onClick={() => setOpen(true)}
        className="text-xs text-zinc-500 hover:text-zinc-300 border border-zinc-800 hover:border-zinc-700 rounded-lg px-3 py-1.5 transition-colors"
      >
        Edit
      </button>
    </>
  );
}
