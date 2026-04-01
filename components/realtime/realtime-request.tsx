"use client";

import { useRealtimeRequest } from "@/hooks/use-realtime-request";

export function RealtimeRequest({ requestId }: { requestId: string }) {
  useRealtimeRequest(requestId);
  return null;
}
