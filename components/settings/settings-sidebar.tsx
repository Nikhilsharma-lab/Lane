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
];

export function SettingsSidebar({ isAdmin }: Props) {
  const pathname = usePathname();

  function linkClass(href: string, danger = false) {
    const active = pathname === href;
    if (danger) {
      return `block px-3 py-2 rounded-lg text-sm transition-colors ${
        active ? "bg-zinc-800 text-red-400" : "text-zinc-500 hover:text-red-400 hover:bg-zinc-900"
      }`;
    }
    return `block px-3 py-2 rounded-lg text-sm transition-colors ${
      active ? "bg-zinc-800 text-white" : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900"
    }`;
  }

  return (
    <aside className="w-[200px] shrink-0">
      <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wide mb-4 px-3">
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
        <div className="my-3 border-t border-zinc-800/60" />
        <Link href="/settings/danger" className={linkClass("/settings/danger", true)}>
          Danger Zone
        </Link>
      </nav>
    </aside>
  );
}
