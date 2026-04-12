"use client";

import { useRouter } from "next/navigation";
import { useHotkeys } from "@/hooks/use-hotkeys";

export function HotkeysProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();

  useHotkeys([
    { keys: ["g", "h"], action: () => router.push("/dashboard") },
    { keys: ["g", "i"], action: () => router.push("/dashboard/inbox") },
    { keys: ["g", "a"], action: () => router.push("/dashboard/ideas") },
    { keys: ["g", "s"], action: () => router.push("/settings") },
    { keys: ["n", "i"], action: () => router.push("/dashboard/ideas?new=1") },
  ]);

  return <>{children}</>;
}
