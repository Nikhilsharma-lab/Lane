"use client";

import { useRealtimeDashboard } from "@/hooks/use-realtime-dashboard";

export function RealtimeDashboard({ orgId }: { orgId: string }) {
  useRealtimeDashboard(orgId);
  return null;
}
