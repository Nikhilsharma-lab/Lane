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
  { href: "/settings/integrations", label: "Integrations" },
];

export function SettingsSidebar({ isAdmin }: Props) {
  const pathname = usePathname();

  function linkClass(href: string, danger = false) {
    const active = pathname === href;
    if (danger) {
      return `block px-3 py-2 rounded-lg text-sm transition-colors ${
        active ? "bg-[var(--bg-hover)] text-red-400" : "text-[var(--text-secondary)] hover:text-red-400 hover:bg-[var(--bg-subtle)]"
      }`;
    }
    return `block px-3 py-2 rounded-lg text-sm transition-colors ${
      active ? "bg-[var(--bg-hover)] text-[var(--text-primary)]" : "text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-subtle)]"
    }`;
  }

  return (
    <aside className="w-[200px] shrink-0">
      <p className="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wide mb-4 px-3">
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
        <div className="my-3 border-t border-[var(--border)]" />
        <Link href="/settings/danger" className={linkClass("/settings/danger", true)}>
          Danger Zone
        </Link>
      </nav>
    </aside>
  );
}
