"use client";

import { useRouter } from "next/navigation";
import { useHotkeys } from "@/hooks/use-hotkeys";

export function HotkeysProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();

  useHotkeys([
    { keys: ["g", "r"], action: () => router.push("/dashboard") },
    { keys: ["g", "i"], action: () => router.push("/dashboard/intake") },
    { keys: ["g", "d"], action: () => router.push("/dashboard/dev") },
    { keys: ["g", "b"], action: () => router.push("/dashboard/betting") },
    { keys: ["g", "a"], action: () => router.push("/dashboard/ideas") },
    { keys: ["g", "c"], action: () => router.push("/dashboard/cycles") },
    { keys: ["g", "l"], action: () => router.push("/dashboard/initiatives") },
    { keys: ["g", "n"], action: () => router.push("/dashboard/insights") },
    { keys: ["g", "t"], action: () => router.push("/dashboard/team") },
    { keys: ["g", "s"], action: () => router.push("/settings") },
    { keys: ["n", "r"], action: () => router.push("/dashboard?new=1") },
    { keys: ["n", "i"], action: () => router.push("/dashboard/ideas?new=1") },
    { keys: ["n", "s"], action: () => router.push("/dashboard/stickies?new=1") },
  ]);

  return <>{children}</>;
}
