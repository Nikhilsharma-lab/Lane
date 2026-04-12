"use client";

import useSWR from "swr";
import type { SidebarData } from "@/lib/nav/types";

const fetcher = (url: string) =>
  fetch(url).then((res) => {
    if (!res.ok) throw new Error(`Nav fetch failed: ${res.status}`);
    return res.json() as Promise<SidebarData>;
  });

export function useSidebarData() {
  const { data, error, isLoading, mutate } = useSWR<SidebarData>(
    "/api/nav",
    fetcher,
    {
      revalidateOnFocus: true,
      revalidateOnReconnect: true,
      dedupingInterval: 5000,
    },
  );

  return { data, error, isLoading, mutate };
}
