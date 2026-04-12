// components/shell/sidebar.tsx
"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTheme } from "next-themes";
import {
  Home,
  Inbox,
  Lightbulb,
  BarChart3,
  Settings,
  LogOut,
  Plus,
  Search,
  Clock,
  Zap,
  FolderOpen,
  Users,
  Sun,
  Moon,
  X,
  ChevronsUpDown,
} from "lucide-react";
import { logout } from "@/app/actions/auth";
import { NotificationsBell } from "@/components/notifications/notifications-bell";
import { PinnedViews } from "@/components/shell/pinned-views";

import {
  Sidebar as ShadcnSidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarSeparator,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Avatar,
  AvatarFallback,
} from "@/components/ui/avatar";

// ── Types ────────────────────────────────────────────────────────────────────

interface SidebarBanner {
  title: string;
  description: string;
  ctaLabel: string;
  ctaHref: string;
}

interface PinnedView {
  id: string;
  name: string;
  viewType: string;
  filters: Record<string, unknown>;
  groupBy: string | null;
  viewMode: string;
}

interface Props {
  user: { initials: string; name: string; role: string };
  userRole?: string;
  orgName: string;
  orgPlan: string;
  activeCount: number;
  inboxUnreadCount?: number;
  banner?: SidebarBanner;
  pinnedViews?: PinnedView[];
}

// ── Nav Config ──────────────────────────────────────────────────────────────

const personalNav = [
  { href: "/dashboard", icon: Home, label: "Home" },
  { href: "/dashboard/inbox", icon: Inbox, label: "Inbox" },
] as const;

const workspaceNav = [
  { href: "/dashboard/requests", icon: Zap, label: "Requests" },
  { href: "/dashboard/projects", icon: FolderOpen, label: "Projects" },
  { href: "/dashboard/ideas", icon: Lightbulb, label: "Ideas" },
  { href: "/dashboard/cycles", icon: Clock, label: "Cycles" },
] as const;

const insightsNav = [
  { href: "/dashboard/insights", icon: BarChart3, label: "Insights" },
  { href: "/dashboard/team", icon: Users, label: "Team" },
] as const;

// ── Sidebar ──────────────────────────────────────────────────────────────────

export function Sidebar({
  user,
  userRole,
  orgName,
  orgPlan,
  activeCount,
  inboxUnreadCount,
  banner,
  pinnedViews,
}: Props) {
  const pathname = usePathname();
  const [bannerDismissed, setBannerDismissed] = useState(false);
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const hasPinnedViews = pinnedViews && pinnedViews.length > 0;

  function isActive(href: string) {
    return href === "/dashboard"
      ? pathname === "/dashboard"
      : pathname.startsWith(href);
  }

  return (
    <ShadcnSidebar variant="inset">
      {/* ── Header ──────────────────────────────────────────── */}
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger>
                <SidebarMenuButton size="lg" className="gap-3" render={<div />}>
                  <div className="flex size-7 items-center justify-center rounded-md bg-primary text-primary-foreground text-[11px] font-bold shrink-0">
                    L
                  </div>
                  <div className="flex flex-col gap-0.5 leading-none">
                    <span className="font-semibold text-sm tracking-tight">
                      {orgName}
                    </span>
                    <span className="flex items-center gap-1.5">
                      <Badge variant="outline" className="h-4 text-[9px] px-1.5 font-mono">
                        {orgPlan}
                      </Badge>
                      <span className="text-[10px] text-muted-foreground font-mono">
                        {activeCount} active
                      </span>
                    </span>
                  </div>
                  <ChevronsUpDown className="ml-auto size-4 text-muted-foreground" />
                </SidebarMenuButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" side="bottom" sideOffset={4}>
                <DropdownMenuItem>
                  <Link href="/settings" className="flex items-center gap-2 w-full">
                    <Settings className="size-3.5" />
                    Organization Settings
                  </Link>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>

        {/* Search */}
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton className="text-muted-foreground">
              <Search className="size-4" />
              <span className="flex-1">Search...</span>
              <kbd className="pointer-events-none h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground hidden sm:inline-flex">
                ⌘K
              </kbd>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      {/* ── Scrollable Content ─────────────────────────────── */}
      <SidebarContent>
        {/* Personal */}
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {personalNav.map((item) => (
                <SidebarMenuItem key={item.href}>
                  <Link href={item.href} className="contents">
                    <SidebarMenuButton
                      isActive={isActive(item.href)}
                      tooltip={item.label}
                    >
                      <item.icon />
                      <span>{item.label}</span>
                    </SidebarMenuButton>
                  </Link>
                  {item.label === "Inbox" && inboxUnreadCount ? (
                    <SidebarMenuBadge>
                      <Badge variant="default" className="h-4 min-w-4 px-1 text-[10px] font-mono">
                        {inboxUnreadCount}
                      </Badge>
                    </SidebarMenuBadge>
                  ) : null}
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarSeparator />

        {/* Workspace */}
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {workspaceNav.map((item) => (
                <SidebarMenuItem key={item.href}>
                  <Link href={item.href} className="contents">
                    <SidebarMenuButton
                      isActive={isActive(item.href)}
                      tooltip={item.label}
                    >
                      <item.icon />
                      <span>{item.label}</span>
                    </SidebarMenuButton>
                  </Link>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarSeparator />

        {/* Insights + Team */}
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {insightsNav.map((item) => (
                <SidebarMenuItem key={item.href}>
                  <Link href={item.href} className="contents">
                    <SidebarMenuButton
                      isActive={isActive(item.href)}
                      tooltip={item.label}
                    >
                      <item.icon />
                      <span>{item.label}</span>
                    </SidebarMenuButton>
                  </Link>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* Pinned Views */}
        {hasPinnedViews && (
          <>
            <SidebarSeparator />
            <SidebarGroup>
              <SidebarGroupLabel>Pinned Views</SidebarGroupLabel>
              <SidebarGroupContent>
                <PinnedViews views={pinnedViews!} />
              </SidebarGroupContent>
            </SidebarGroup>
          </>
        )}
      </SidebarContent>

      {/* ── Footer ──────────────────────────────────────────── */}
      <SidebarFooter>
        {/* New Request button */}
        <Button className="w-full gap-1.5" size="lg">
          <Plus className="size-4" />
          New Request
        </Button>

        {/* Promo banner */}
        {banner && !bannerDismissed && (
          <div className="rounded-lg border bg-card p-3">
            <div className="flex items-start justify-between gap-2">
              <span className="text-xs font-medium text-foreground leading-snug">
                {banner.title}
              </span>
              <Button
                variant="ghost"
                size="icon-xs"
                onClick={() => setBannerDismissed(true)}
              >
                <X className="size-3" />
              </Button>
            </div>
            <p className="text-[11px] text-muted-foreground mt-1 leading-relaxed">
              {banner.description}
            </p>
            <Link href={banner.ctaHref} className="contents">
              <Button variant="secondary" size="sm" className="w-full mt-2">
                {banner.ctaLabel}
              </Button>
            </Link>
          </div>
        )}

        <Separator />

        {/* User */}
        <div className="flex items-center gap-1 px-2">
          <DropdownMenu>
            <DropdownMenuTrigger>
              <div className="flex items-center gap-2.5 flex-1 min-w-0 rounded-md px-2 py-1.5 hover:bg-sidebar-accent cursor-pointer transition-colors">
                <Avatar className="size-7 shrink-0">
                  <AvatarFallback className="text-[10px] font-semibold">
                    {user.initials}
                  </AvatarFallback>
                </Avatar>
                <div className="flex flex-col gap-0.5 leading-none min-w-0">
                  <span className="text-xs font-medium truncate">{user.name}</span>
                  <span className="text-[10px] text-muted-foreground font-mono truncate">
                    {user.role}
                  </span>
                </div>
              </div>
            </DropdownMenuTrigger>
              <DropdownMenuContent align="start" side="top" sideOffset={4}>
                <DropdownMenuItem>
                  <Link href="/settings" className="flex items-center gap-2 w-full">
                    <Settings className="size-3.5" />
                    Settings
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="text-destructive"
                  onClick={async () => {
                    await logout();
                  }}
                >
                  <LogOut className="size-3.5" />
                  Log out
                </DropdownMenuItem>
              </DropdownMenuContent>
          </DropdownMenu>
          <NotificationsBell userRole={userRole} />
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
          >
            {mounted && resolvedTheme === "dark" ? (
              <Sun className="size-3.5" />
            ) : (
              <Moon className="size-3.5" />
            )}
          </Button>
        </div>
      </SidebarFooter>
    </ShadcnSidebar>
  );
}
