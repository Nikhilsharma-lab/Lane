"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

/**
 * Subscribes to real-time changes for a request and its related data.
 * Calls router.refresh() when anything changes so server components
 * re-render with fresh data automatically.
 *
 * Tables watched:
 *  - requests            (stage/phase/status changes)
 *  - comments            (new comments, system messages)
 *  - validation_signoffs (sign-off updates)
 *  - figma_updates       (design history)
 */
export function useRealtimeRequest(requestId: string) {
  const router = useRouter();
  const channelRef = useRef<ReturnType<ReturnType<typeof createClient>["channel"]> | null>(null);

  useEffect(() => {
    const supabase = createClient();

    const channel = supabase
      .channel(`request:${requestId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "requests",
          filter: `id=eq.${requestId}`,
        },
        () => router.refresh()
      )
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "comments",
          filter: `request_id=eq.${requestId}`,
        },
        () => router.refresh()
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "validation_signoffs",
          filter: `request_id=eq.${requestId}`,
        },
        () => router.refresh()
      )
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "figma_updates",
          filter: `request_id=eq.${requestId}`,
        },
        () => router.refresh()
      )
      .subscribe();

    channelRef.current = channel;

    return () => {
      supabase.removeChannel(channel);
    };
  }, [requestId, router]);
}
