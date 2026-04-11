"use client";

import { useRouter } from "next/navigation";
import { useHotkeys } from "@/hooks/use-hotkeys";

export function HotkeysProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();

  useHotkeys([
    { keys: ["g", "h"], action: () => router.push("/dashboard") },
    { keys: ["g", "r"], action: () => router.push("/dashboard/requests") },
    { keys: ["g", "i"], action: () => router.push("/dashboard/inbox") },
    { keys: ["g", "p"], action: () => router.push("/dashboard/projects") },
    { keys: ["g", "a"], action: () => router.push("/dashboard/ideas") },
    { keys: ["g", "c"], action: () => router.push("/dashboard/cycles") },
    { keys: ["g", "n"], action: () => router.push("/dashboard/insights") },
    { keys: ["g", "t"], action: () => router.push("/dashboard/team") },
    { keys: ["g", "s"], action: () => router.push("/settings") },
    { keys: ["n", "r"], action: () => router.push("/dashboard/requests?new=1") },
    { keys: ["n", "i"], action: () => router.push("/dashboard/ideas?new=1") },
    { keys: ["n", "s"], action: () => router.push("/dashboard/stickies?new=1") },
  ]);

  return <>{children}</>;
}
