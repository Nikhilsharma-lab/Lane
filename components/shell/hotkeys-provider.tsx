"use client";

import { useRouter } from "next/navigation";
import { useHotkeys } from "@/hooks/use-hotkeys";

export function HotkeysProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();

  useHotkeys([
    { keys: ["g", "h"], action: () => router.push("/dashboard") },
    { keys: ["g", "i"], action: () => router.push("/dashboard/inbox") },
    { keys: ["g", "m"], action: () => router.push("/dashboard/my-requests") },
    { keys: ["g", "s"], action: () => router.push("/dashboard/submitted") },
    { keys: ["g", "d"], action: () => router.push("/dashboard/drafts") },
    { keys: ["g", "r"], action: () => router.push("/dashboard/reflections") },
    { keys: ["g", "b"], action: () => router.push("/dashboard/ideas") },
    { keys: ["n", "i"], action: () => router.push("/dashboard/ideas?new=1") },
  ]);

  return <>{children}</>;
}
