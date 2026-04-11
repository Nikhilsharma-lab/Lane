"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

interface Props {
  isAdmin: boolean;
}

const BASE_NAV = [
  { href: "/settings/account", label: "Account" },
  { href: "/settings/workspace", label: "Workspace" },
  { href: "/settings/members", label: "Members" },
  { href: "/settings/projects", label: "Projects" },
  { href: "/settings/notifications", label: "Notifications" },
  { href: "/settings/integrations", label: "Integrations" },
];

export function SettingsSidebar({ isAdmin }: Props) {
  const pathname = usePathname();

  function linkClass(href: string, danger = false) {
    const active = pathname === href;
    if (danger) {
      return `block px-3 py-2 rounded-lg text-sm transition-colors ${
        active ? "bg-red-500/10 text-red-500" : "text-muted-foreground hover:text-red-400 hover:bg-muted"
      }`;
    }
    return `block px-3 py-2 rounded-lg text-sm transition-colors ${
      active ? "bg-primary/10 text-primary font-medium" : "text-muted-foreground hover:text-foreground hover:bg-accent"
    }`;
  }

  return (
    <aside className="w-[200px] shrink-0">
      <Link
        href="/dashboard"
        className="flex items-center gap-1.5 px-3 py-1.5 mb-5 text-xs text-muted-foreground/60 hover:text-foreground transition-colors rounded-lg hover:bg-accent"
      >
        ← Dashboard
      </Link>
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-4 px-3">
        Settings
      </p>
      <nav className="space-y-0.5">
        {BASE_NAV.map((item) => (
          <Link key={item.href} href={item.href} className={linkClass(item.href)}>
            {item.label}
          </Link>
        ))}
        {isAdmin && (
          <Link href="/settings/plan" className={linkClass("/settings/plan")}>
            Plan
          </Link>
        )}
        <div className="my-3 border-t border-border" />
        <Link href="/settings/danger" className={linkClass("/settings/danger", true)}>
          Danger Zone
        </Link>
      </nav>
    </aside>
  );
}
