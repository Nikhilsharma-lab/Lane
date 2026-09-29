"use client";

import Link from "next/link";
import { SignOutButton, useOrganization } from "@clerk/nextjs";
import { usePathname, useSearchParams } from "next/navigation";
import {
  ChevronsUpDown,
  Inbox,
  Plus,
  Circle,
  CircleCheck,
  Timer,
  Users,
  LogOut,
  Menu,
  Settings as SettingsIcon,
  UserRound,
} from "lucide-react";
import { IdentityMark } from "@/components/ui/identity-mark";
import { Sidebar as LibrarySidebar, SidebarProvider, SidebarHeader, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupLabel, SidebarMenu, SidebarMenuItem, SidebarMenuButton } from "@/components/ui/sidebar";
import { parseRequestStatusFilter, requestListHref } from "@/lib/request-workspace";
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

const STATUS_NAV = [
  { label: "Open", status: "open", icon: Circle },
  { label: "In Progress", status: "in_progress", icon: Timer },
  { label: "Done", status: "done", icon: CircleCheck },
] as const;

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
  const searchParams = useSearchParams();
  const filter = parseRequestStatusFilter(searchParams.get("status") ?? undefined);
  const isRequests = pathname === "/" || pathname.startsWith("/requests/");
  const { isLoaded, organization } = useOrganization();
  // Clerk owns the current name. The server's local projection is only a fallback
  // while the matching resource is unavailable; it never selects the workspace.
  const displayedWorkspaceName =
    isLoaded && organization?.id === orgId && organization.name.trim()
      ? organization.name
      : workspaceName;
  const navItems = [
    { label: "New Request", href: "/intake", icon: Plus, active: pathname === "/intake" },
    { label: role === "guest" ? "My Requests" : "All Requests", href: "/", icon: Inbox, active: isRequests && filter === "all" },
    ...STATUS_NAV.map(item => ({ ...item, href: requestListHref(item.status), active: isRequests && filter === item.status })),
  ];

  return (
    <>
      <header
        data-slot="mobile-navigation"
        className="flex h-14 shrink-0 items-center justify-between border-b bg-card px-3 sm:hidden"
      >
        <Link
          href="/"
          className="flex min-w-0 items-center gap-2.5 rounded-md outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <IdentityMark label={displayedWorkspaceName} kind="workspace" />
          <span className="truncate text-type-control font-semibold">{displayedWorkspaceName}</span>
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
                <DropdownMenuLabel className="truncate">{displayedWorkspaceName}</DropdownMenuLabel>
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
              <DropdownMenuGroup>
                {navItems.map((item) => (
                  <DropdownMenuItem
                    key={item.href}
                    render={<Link href={item.href} aria-current={item.active ? "page" : undefined} />}
                    className="min-h-touch-target"
                  >
                    <item.icon className="size-4" />
                    {item.label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
              {role !== "guest" && <DropdownMenuItem render={<Link href="/settings/members" />} className="min-h-touch-target"><Users className="size-4" />Members</DropdownMenuItem>}
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
              <SignOutButton redirectUrl="/login">
                <button
                  type="button"
                  className="flex min-h-touch-target w-full cursor-default items-center gap-1.5 rounded-md px-1.5 py-1 text-type-control outline-hidden select-none hover:bg-accent hover:text-accent-foreground"
                >
                  <LogOut className="size-4" />
                  Log out
                </button>
              </SignOutButton>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      <aside data-slot="global-navigation" aria-label="Workspace sidebar" className="hidden h-dvh w-[184px] shrink-0 border-r bg-card sm:sticky sm:top-0 sm:flex lg:w-[232px]">
      <SidebarProvider className="min-h-0" style={{ "--sidebar-width": "232px" } as React.CSSProperties}>
      <LibrarySidebar collapsible="none" className="w-full">
      <SidebarHeader className="flex-row items-center gap-2.5 border-b px-4 py-5">
        <IdentityMark label={displayedWorkspaceName} kind="workspace" />
        <span className="truncate text-type-control font-semibold">{displayedWorkspaceName}</span>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Requests</SidebarGroupLabel>
          <nav aria-label="Primary navigation">
            <SidebarMenu>
              {navItems.slice(0, 2).map(item => (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton render={<Link href={item.href} aria-current={item.active ? "page" : undefined} />} isActive={item.active} className="h-11 sm:h-8">
                    <item.icon aria-hidden="true" /><span>{item.label}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </nav>
        </SidebarGroup>
        <SidebarGroup>
          <SidebarGroupLabel>Status</SidebarGroupLabel>
          <nav aria-label="Request status filters">
            <SidebarMenu>
              {navItems.slice(2).map(item => (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton render={<Link href={item.href} aria-current={item.active ? "page" : undefined} />} isActive={item.active} className="h-11 sm:h-8">
                    <item.icon aria-hidden="true" /><span>{item.label}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </nav>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="border-t px-2 py-3">
        <NotificationBell orgId={orgId} />
        <SidebarGroup className="p-0">
          <SidebarGroupLabel><SettingsIcon aria-hidden="true" className="mr-2 size-3.5" />Settings</SidebarGroupLabel>
          <SidebarMenu>
            {role !== "guest" && <SidebarMenuItem>
              <SidebarMenuButton render={<Link href="/settings/members" aria-current={pathname === "/settings/members" ? "page" : undefined} />} isActive={pathname === "/settings/members"}>
                <Users aria-hidden="true" /><span>Members</span>
              </SidebarMenuButton>
            </SidebarMenuItem>}
            <SidebarMenuItem>
              <SidebarMenuButton render={<Link href="/settings/profile" aria-current={pathname === "/settings/profile" ? "page" : undefined} />} isActive={pathname === "/settings/profile"}>
                <UserRound aria-hidden="true" /><span>Profile</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroup>
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
            <SignOutButton redirectUrl="/login">
              <button
                type="button"
                className="flex min-h-control-utility w-full cursor-default items-center gap-1.5 rounded-md px-1.5 py-1 text-type-control outline-hidden select-none hover:bg-accent hover:text-accent-foreground"
              >
                <LogOut className="size-4" />
                Log out
              </button>
            </SignOutButton>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarFooter>
      </LibrarySidebar>
      </SidebarProvider>
      </aside>
    </>
  );
}
