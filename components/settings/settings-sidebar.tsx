"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ArrowLeft,
  User,
  Bell,
  Building2,
  Users,
  FolderKanban,
  Puzzle,
  CreditCard,
  AlertTriangle,
} from "lucide-react";

interface Props {
  isAdmin: boolean;
}

interface NavItem {
  href: string;
  label: string;
  icon: React.ElementType;
  danger?: boolean;
}

interface NavGroup {
  label: string;
  items: NavItem[];
}

export function SettingsSidebar({ isAdmin }: Props) {
  const pathname = usePathname();

  const groups: NavGroup[] = [
    {
      label: "My Account",
      items: [
        { href: "/settings/account", label: "Profile", icon: User },
        { href: "/settings/notifications", label: "Notifications", icon: Bell },
      ],
    },
    {
      label: "Workspace",
      items: [
        { href: "/settings/workspace", label: "General", icon: Building2 },
        { href: "/settings/members", label: "Members", icon: Users },
        { href: "/settings/projects", label: "Projects", icon: FolderKanban },
        { href: "/settings/integrations", label: "Integrations", icon: Puzzle },
      ],
    },
  ];

  if (isAdmin) {
    groups.push({
      label: "Administration",
      items: [
        { href: "/settings/plan", label: "Plan & Billing", icon: CreditCard },
        { href: "/settings/danger", label: "Danger Zone", icon: AlertTriangle, danger: true },
      ],
    });
  }

  return (
    <aside className="w-[220px] shrink-0">
      <Link
        href="/dashboard"
        className="inline-flex items-center gap-1.5 mb-6 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="size-3.5" />
        Back to app
      </Link>

      <nav className="space-y-6">
        {groups.map((group) => (
          <div key={group.label}>
            <p className="text-[11px] font-medium text-muted-foreground/60 uppercase tracking-wider mb-1.5 px-2">
              {group.label}
            </p>
            <div className="space-y-0.5">
              {group.items.map((item) => {
                const active = pathname === item.href;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`flex items-center gap-2.5 px-2 py-1.5 rounded-md text-sm transition-colors ${
                      active
                        ? item.danger
                          ? "bg-destructive/10 text-destructive font-medium"
                          : "bg-sidebar-accent text-foreground font-medium"
                        : item.danger
                          ? "text-muted-foreground hover:text-destructive hover:bg-destructive/5"
                          : "text-muted-foreground hover:text-foreground hover:bg-accent"
                    }`}
                  >
                    <item.icon className="size-4 shrink-0" />
                    {item.label}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>
    </aside>
  );
}
