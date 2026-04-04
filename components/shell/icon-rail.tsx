// components/shell/icon-rail.tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutGrid,
  FileText,
  Lightbulb,
  Users,
  Activity,
  Settings,
  LogOut,
} from "lucide-react";
import { logout } from "@/app/actions/auth";

const NAV = [
  { href: "/dashboard", icon: FileText, label: "Requests" },
  { href: "/dashboard/ideas", icon: Lightbulb, label: "Ideas" },
  { href: "/dashboard/team", icon: Users, label: "Team" },
  { href: "/dashboard/radar", icon: Activity, label: "Radar" },
  { href: "/dashboard/insights", icon: LayoutGrid, label: "Insights" },
];

export function IconRail() {
  const pathname = usePathname();

  return (
    <aside
      className="flex flex-col items-center py-4 gap-3 shrink-0"
      style={{
        width: "var(--rail-width)",
        background: "var(--bg-subtle)",
        borderRight: "1px solid var(--border)",
        height: "100vh",
        position: "sticky",
        top: 0,
        zIndex: 20,
      }}
    >
      {/* Logo mark */}
      <div
        className="flex items-center justify-center rounded-md mb-1 shrink-0"
        style={{
          width: 28,
          height: 28,
          background: "var(--accent)",
        }}
      >
        <span style={{ color: "white", fontSize: 11, fontWeight: 700, letterSpacing: "-0.02em" }}>
          DQ
        </span>
      </div>

      <div style={{ width: 24, height: 1, background: "var(--border)" }} />

      {/* Nav icons */}
      {NAV.map(({ href, icon: Icon, label }) => {
        const isActive = pathname === href || (href !== "/dashboard" && pathname.startsWith(href));
        return (
          <Link
            key={href}
            href={href}
            title={label}
            className="flex items-center justify-center rounded-md transition-colors"
            style={{
              width: 32,
              height: 32,
              background: isActive ? "var(--accent)" : "transparent",
              color: isActive ? "white" : "var(--text-tertiary)",
            }}
          >
            <Icon size={16} />
          </Link>
        );
      })}

      <div style={{ flex: 1 }} />

      {/* Settings at bottom */}
      <Link
        href="/settings"
        title="Settings"
        className="flex items-center justify-center rounded-md transition-colors"
        style={{
          width: 32,
          height: 32,
          color: "var(--text-tertiary)",
        }}
      >
        <Settings size={16} />
      </Link>

      {/* Sign out */}
      <form action={logout}>
        <button
          type="submit"
          title="Sign out"
          className="flex items-center justify-center rounded-md transition-colors hover:bg-red-500/10"
          style={{
            width: 32,
            height: 32,
            color: "var(--text-tertiary)",
            background: "transparent",
            border: "none",
            cursor: "pointer",
          }}
        >
          <LogOut size={16} />
        </button>
      </form>
    </aside>
  );
}
