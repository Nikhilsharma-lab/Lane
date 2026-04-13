// components/shell/sidebar.tsx
"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTheme } from "next-themes";
import {
  Home,
  Inbox,
  Layers,
  FileEdit,
  Bookmark,
  Lightbulb,
  MessageSquare,
  Send,
  Settings,
  LogOut,
  Search,
  UserPlus,
  Sun,
  Moon,
  ChevronsUpDown,
  Sparkles,
} from "lucide-react";
import { logout } from "@/app/actions/auth";
import { useSidebarData } from "@/hooks/use-sidebar-data";
import { TeamSection } from "@/components/nav/team-section";
import { NavBadge } from "@/components/nav/badge";

import {
  Sidebar as ShadcnSidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarSeparator,
} from "@/components/ui/sidebar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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

interface Props {
  user: { initials: string; name: string; role: string };
  userRole?: string;
  orgName: string;
  orgPlan: string;
  activeCount: number;
  inboxUnreadCount?: number;
}

// ── Nav Config ──────────────────────────────────────────────────────────────

const personalNav = [
  { href: "/dashboard", icon: Home, label: "Home" },
  { href: "/dashboard/inbox", icon: Inbox, label: "Inbox" },
  { href: "/dashboard/my-requests", icon: Layers, label: "My requests" },
  { href: "/dashboard/submitted", icon: Send, label: "Submitted by me" },
  { href: "/dashboard/drafts", icon: FileEdit, label: "My drafts" },
  { href: "/dashboard/saved", icon: Bookmark, label: "Saved" },
  { href: "/dashboard/reflections", icon: MessageSquare, label: "Reflections" },
  { href: "/dashboard/ideas", icon: Lightbulb, label: "Ideas" },
] as const;

// ── Sidebar ──────────────────────────────────────────────────────────────────

export function Sidebar({
  user,
  userRole,
  orgName,
  orgPlan,
  activeCount,
  inboxUnreadCount,
}: Props) {
  const pathname = usePathname();
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [showUpdates, setShowUpdates] = useState(false);
  useEffect(() => setMounted(true), []);

  // Fetch team data for Zone 3
  const { data: sidebarData } = useSidebarData();
  const teams = sidebarData?.teams ?? [];

  function isActive(href: string) {
    return href === "/dashboard"
      ? pathname === "/dashboard"
      : pathname.startsWith(href);
  }

  return (
    <ShadcnSidebar variant="inset">
      {/* ── Zone 1: Workspace Header ──────────────────────── */}
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger>
                <SidebarMenuButton size="lg" className="gap-3" render={<div />}>
                  <div className="flex size-7 items-center justify-center rounded-md bg-primary text-primary-foreground text-[11px] font-bold shrink-0">
                    {orgName.charAt(0).toUpperCase()}
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
                    Settings
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem>
                  <Link href="/settings/members?invite=1" className="flex items-center gap-2 w-full">
                    <UserPlus className="size-3.5" />
                    Invite and manage members
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem>
                  <div className="flex items-center gap-2.5 w-full">
                    <Avatar className="size-5 shrink-0">
                      <AvatarFallback className="text-[8px] font-semibold">
                        {user.initials}
                      </AvatarFallback>
                    </Avatar>
                    <span className="text-xs truncate">{user.name}</span>
                  </div>
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
                >
                  {mounted && resolvedTheme === "dark" ? (
                    <Sun className="size-3.5" />
                  ) : (
                    <Moon className="size-3.5" />
                  )}
                  {mounted && resolvedTheme === "dark" ? "Light mode" : "Dark mode"}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="text-destructive"
                  onClick={async () => { await logout(); }}
                >
                  <LogOut className="size-3.5" />
                  Log out
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
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      {/* ── Scrollable Content ─────────────────────────────── */}
      <SidebarContent>
        {/* Zone 2: Personal */}
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
                      <NavBadge tier={2} value={inboxUnreadCount} />
                    </SidebarMenuBadge>
                  ) : null}
                  {item.label === "My requests" && sidebarData?.personal?.myRequests ? (
                    <SidebarMenuBadge>
                      <NavBadge tier={2} value={sidebarData.personal.myRequests} />
                    </SidebarMenuBadge>
                  ) : null}
                  {item.label === "Submitted by me" && sidebarData?.personal?.submittedByMe ? (
                    <SidebarMenuBadge>
                      <NavBadge tier={2} value={sidebarData.personal.submittedByMe} />
                    </SidebarMenuBadge>
                  ) : null}
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* Zone 3: Teams */}
        {teams.length > 0 && (
          <>
            <SidebarSeparator />
            {teams.map((team, i) => (
              <TeamSection
                key={team.id}
                team={team}
                defaultOpen={i < 4}
              />
            ))}
          </>
        )}
      </SidebarContent>

      {/* ── Footer ─────────────────────────────────────────── */}
      <SidebarFooter>
        <SidebarSeparator />
        <div className="px-3 py-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowUpdates((v) => !v)}
            className="flex items-center gap-2 text-[11px] text-muted-foreground hover:text-sidebar-accent-foreground transition-colors w-full"
          >
            <Sparkles className="size-3.5" />
            <span>What&apos;s new</span>
          </Button>
          {showUpdates && (
            <div className="mt-2 rounded-lg border bg-popover p-3 text-popover-foreground shadow-md">
              <p className="text-xs font-medium mb-1">Latest updates</p>
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                Turbopack enabled, query performance improved, dark mode refined.
              </p>
            </div>
          )}
        </div>
      </SidebarFooter>
    </ShadcnSidebar>
  );
}
