"use client";

import { useRealtimeRadar } from "@/hooks/use-realtime-radar";

export function RealtimeRadar({ orgId }: { orgId: string }) {
  useRealtimeRadar(orgId);
  return null;
}
