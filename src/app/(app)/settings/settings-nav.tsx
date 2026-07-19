"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const ITEMS = [
  { href: "/settings/profile", label: "Profile", membersOnly: false },
  { href: "/settings/members", label: "Members", membersOnly: true },
] as const;

export function SettingsNav({ isGuest }: { isGuest: boolean }) {
  const pathname = usePathname();

  return (
    <nav aria-label="Settings" className="flex gap-1 border-b px-2 sm:px-6">
      {ITEMS.filter((item) => !item.membersOnly || !isGuest).map((item) => (
        <Link
          key={item.href}
          href={item.href}
          aria-current={pathname === item.href ? "page" : undefined}
          className={cn(
            "flex min-h-touch-target items-center border-b-2 border-transparent px-3 text-type-control text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
            pathname === item.href && "border-foreground text-foreground"
          )}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
