"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ChevronsUpDown,
  Inbox,
  LogOut,
  Menu,
  Settings as SettingsIcon,
  UserRound,
} from "lucide-react";
import { logout } from "@/app/(auth)/actions";
import { IdentityMark } from "@/components/ui/identity-mark";
import { cn } from "@/lib/utils";
import { NAV_MATCHERS, NAV_ITEM_BASE, NAV_ITEM_ACTIVE, NAV_ITEM_INACTIVE } from "./sidebar-utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { NotificationBell } from "./notification-bell";

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
  orgId,
}: {
  workspaceName: string;
  fullName: string;
  email: string;
  role: string;
  orgId: string;
}) {
  const pathname = usePathname();
  const navItems = role === "guest" ? GUEST_NAV : MEMBER_NAV;

  return (
    <>
      <header
        data-slot="mobile-navigation"
        className="flex h-14 shrink-0 items-center justify-between border-b bg-card px-3 xl:hidden"
      >
        <Link
          href="/"
          className="flex min-w-0 items-center gap-2.5 rounded-md outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <IdentityMark label={workspaceName} kind="workspace" />
          <span className="truncate text-type-control font-semibold">{workspaceName}</span>
        </Link>

        <div className="flex items-center gap-1">
          <NotificationBell orgId={orgId} compact />
          <DropdownMenu>
            <DropdownMenuTrigger
              aria-label="Open navigation"
              className="flex size-11 items-center justify-center rounded-md text-muted-foreground outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              <Menu className="size-4" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" sideOffset={8} className="w-64">
              <DropdownMenuGroup>
                <DropdownMenuLabel className="truncate">{workspaceName}</DropdownMenuLabel>
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
              <DropdownMenuGroup>
                {navItems.map((item) => (
                  <DropdownMenuItem
                    key={item.href}
                    render={<Link href={item.href} />}
                    className="min-h-touch-target"
                  >
                    <item.icon className="size-4" />
                    {item.label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
              <DropdownMenuGroup>
                <DropdownMenuLabel className="flex min-w-0 items-center gap-3 py-2 font-normal">
                  <IdentityMark label={fullName} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium text-foreground">{fullName}</span>
                    <span className="block truncate text-type-meta text-muted-foreground">{email}</span>
                  </span>
                </DropdownMenuLabel>
                <DropdownMenuItem
                  render={<Link href="/settings/profile" />}
                  className="min-h-touch-target"
                >
                  <UserRound className="size-4" />
                  Profile
                </DropdownMenuItem>
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
              <form action={logout}>
                <button
                  type="submit"
                  className="flex min-h-touch-target w-full cursor-default items-center gap-1.5 rounded-md px-1.5 py-1 text-type-control outline-hidden select-none hover:bg-accent hover:text-accent-foreground"
                >
                  <LogOut className="size-4" />
                  Log out
                </button>
              </form>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      <aside
        data-slot="global-navigation"
        className="hidden w-[240px] shrink-0 flex-col border-r bg-card xl:flex"
      >
      <div className="flex items-center gap-2.5 border-b px-4 py-3.5">
        <IdentityMark label={workspaceName} kind="workspace" />
        <span className="truncate text-type-control font-semibold">{workspaceName}</span>
      </div>

      <nav className="flex-1 px-2 py-2">
        {navItems.map((item) => {
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
        <NotificationBell orgId={orgId} />
      </nav>

      <div className="border-t px-2 py-2">
        <DropdownMenu>
          <DropdownMenuTrigger className="flex min-h-control-product w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-left text-type-control transition-colors outline-none hover:bg-accent">
            <IdentityMark label={fullName} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-type-control">{fullName}</span>
              <span className="block truncate text-type-meta text-muted-foreground">{email}</span>
            </span>
            <ChevronsUpDown className="size-4 shrink-0 text-muted-foreground" />
          </DropdownMenuTrigger>
          <DropdownMenuContent side="top" sideOffset={8} align="start" className="w-[216px]">
            <DropdownMenuGroup>
              <DropdownMenuLabel>{email}</DropdownMenuLabel>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuItem render={<Link href="/settings/profile" />}>
              <UserRound className="size-4" />
              Profile
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <form action={logout}>
              <button
                type="submit"
                className="flex min-h-control-utility w-full cursor-default items-center gap-1.5 rounded-md px-1.5 py-1 text-type-control outline-hidden select-none hover:bg-accent hover:text-accent-foreground"
              >
                <LogOut className="size-4" />
                Log out
              </button>
            </form>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      </aside>
    </>
  );
}
