"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
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
      <Button
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
      >
        Edit
      </Button>
    </>
  );
}
