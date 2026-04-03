"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

/**
 * Subscribes to request changes for the radar page.
 * Refreshes on any change so designer status and risk panels stay current.
 */
export function useRealtimeRadar(orgId: string) {
  const router = useRouter();

  useEffect(() => {
    const supabase = createClient();

    const requestsChannel = supabase
      .channel(`radar-requests:${orgId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "requests",
          filter: `org_id=eq.${orgId}`,
        },
        () => router.refresh()
      )
      .subscribe();

    const figmaChannel = supabase
      .channel(`radar-figma:${orgId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "figma_updates",
        },
        () => router.refresh()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(requestsChannel);
      supabase.removeChannel(figmaChannel);
    };
  }, [orgId, router]);
}
