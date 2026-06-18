"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogOut, Inbox, Settings as SettingsIcon, ChevronsUpDown } from "lucide-react";
import { logout } from "@/app/(auth)/actions";
import { cn } from "@/lib/utils";
import { initials, NAV_MATCHERS, NAV_ITEM_BASE, NAV_ITEM_ACTIVE, NAV_ITEM_INACTIVE } from "./sidebar-utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const MEMBER_NAV = [
  { label: "Requests", href: "/", icon: Inbox, match: NAV_MATCHERS.requests },
  { label: "Settings", href: "/settings/members", icon: SettingsIcon, match: NAV_MATCHERS.settings },
];

const GUEST_NAV = [
  { label: "My Requests", href: "/", icon: Inbox, match: NAV_MATCHERS.requests },
];

export function Sidebar({
  workspaceName,
  fullName,
  email,
  role,
}: {
  workspaceName: string;
  fullName: string;
  email: string;
  role: string;
}) {
  const pathname = usePathname();

  return (
    <aside className="flex w-[240px] shrink-0 flex-col border-r bg-card">
      <div className="flex items-center gap-2.5 border-b px-4 py-3.5">
        <span className="flex size-7 items-center justify-center rounded-md bg-primary text-xs font-semibold text-primary-foreground">
          {workspaceName[0]?.toUpperCase()}
        </span>
        <span className="truncate text-sm font-semibold">{workspaceName}</span>
      </div>

      <nav className="flex-1 px-2 py-2">
        {(role === "guest" ? GUEST_NAV : MEMBER_NAV).map((item) => {
          const active = item.match(pathname);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(NAV_ITEM_BASE, active ? NAV_ITEM_ACTIVE : NAV_ITEM_INACTIVE)}
            >
              <item.icon className="size-4" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="border-t px-2 py-2">
        <DropdownMenu>
          <DropdownMenuTrigger className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-left text-sm transition-colors outline-none hover:bg-accent">
            <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium text-muted-foreground">
              {initials(fullName)}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium">{fullName}</span>
              <span className="block truncate text-xs text-muted-foreground">{email}</span>
            </span>
            <ChevronsUpDown className="size-4 shrink-0 text-muted-foreground" />
          </DropdownMenuTrigger>
          <DropdownMenuContent side="top" sideOffset={8} align="start" className="w-[216px]">
            <DropdownMenuGroup>
              <DropdownMenuLabel>{email}</DropdownMenuLabel>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <form action={logout}>
              <button
                type="submit"
                className="flex w-full cursor-default items-center gap-1.5 rounded-md px-1.5 py-1 text-sm outline-hidden select-none hover:bg-accent hover:text-accent-foreground"
              >
                <LogOut className="size-4" />
                Log out
              </button>
            </form>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </aside>
  );
}
