// components/shell/sidebar.tsx
"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { X } from "lucide-react";
import {
  Home,
  Inbox,
  Lightbulb,
  BarChart3,
  Settings,
  LogOut,
  Plus,
  Search,
  ChevronDown,
  Clock,
  Zap,
  FolderOpen,
  Users,
} from "lucide-react";
import { logout } from "@/app/actions/auth";
import { NotificationsBell } from "@/components/notifications/notifications-bell";
import { PinnedViews } from "@/components/shell/pinned-views";

// ── Types ────────────────────────────────────────────────────────────────────

interface NavItem {
  href: string;
  icon: React.ComponentType<{ size?: number | string }>;
  label: string;
  badge?: number | string;
  badgeStyle?: "accent" | "warn" | "muted";
  trailing?: string;
}

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
  banner?: SidebarBanner;
  pinnedViews?: PinnedView[];
}

// ── Nav Item ─────────────────────────────────────────────────────────────────

function NavItemLink({ href, icon: Icon, label, badge, badgeStyle, trailing }: NavItem) {
  const pathname = usePathname();
  // Home only matches exact "/dashboard"; all others use startsWith
  const isActive =
    href === "/dashboard"
      ? pathname === "/dashboard"
      : pathname.startsWith(href);

  return (
    <Link
      href={href}
      className={`flex items-center gap-2.5 px-2.5 py-[7px] rounded-[7px] relative transition-colors${isActive ? " bg-accent" : ""}`}
    >
      {isActive && (
        <span
          className="absolute left-0 top-1/2 -translate-y-1/2 rounded-r bg-primary"
          style={{ width: 2.5, height: 14 }}
        />
      )}
      <Icon size={15} />
      <span
        className={`flex-1 truncate ${isActive ? "text-foreground" : "text-muted-foreground"}`}
        style={{
          fontSize: 13,
          fontWeight: isActive ? 560 : 460,
          letterSpacing: "-0.01em",
        }}
      >
        {label}
      </span>
      {badge !== undefined && (
        <span
          className={`rounded-full text-center ${
            badgeStyle === "accent"
              ? "bg-primary text-primary-foreground"
              : badgeStyle === "warn"
              ? "bg-yellow-100 text-yellow-700"
              : "bg-muted text-muted-foreground border"
          }`}
          style={{
            fontFamily: "'Geist Mono', monospace",
            fontSize: 10,
            fontWeight: 600,
            padding: "1px 6px",
            minWidth: 16,
            lineHeight: "16px",
          }}
        >
          {badge}
        </span>
      )}
      {trailing && (
        <span
          className="text-muted-foreground/60"
          style={{
            fontFamily: "'Geist Mono', monospace",
            fontSize: 10,
          }}
        >
          {trailing}
        </span>
      )}
    </Link>
  );
}

// ── Divider ───────────────────────────────────────────────────────────────────

function NavDivider() {
  return <div className="my-1 mx-2.5 border-t" />;
}

// ── Section Label ─────────────────────────────────────────────────────────────

function SectionLabel({ label }: { label: string }) {
  return (
    <div className="px-2.5 pt-2 pb-1">
      <span
        style={{
          fontFamily: "'Geist Mono', monospace",
          fontSize: 10,
          fontWeight: 600,
          letterSpacing: "0.06em",
          textTransform: "uppercase" as const,
        }}
        className="text-muted-foreground/60"
      >
        {label}
      </span>
    </div>
  );
}

// ── Sidebar ──────────────────────────────────────────────────────────────────

export function Sidebar({ user, userRole, orgName, orgPlan, activeCount, banner, pinnedViews }: Props) {
  const [bannerDismissed, setBannerDismissed] = useState(false);
  const hasPinnedViews = pinnedViews && pinnedViews.length > 0;

  return (
    <aside
      className="flex flex-col shrink-0 select-none bg-muted border-r sticky top-0 z-20"
      style={{
        width: 256,
        minWidth: 256,
        height: "100vh",
      }}
    >
      {/* ── Header ──────────────────────────────────────────────── */}
      <div className="px-3.5 pt-4 pb-3 border-b">
        <div className="flex items-center gap-2.5 px-1.5 py-1 rounded-lg cursor-pointer hover:bg-accent transition-colors">
          <div
            className="flex items-center justify-center rounded-[7px] shrink-0 bg-primary"
            style={{
              width: 28,
              height: 28,
              boxShadow: "0 1px 4px rgba(46,83,57,0.15)",
            }}
          >
            <span style={{ fontSize: 12, fontWeight: 700, color: "#fff" }}>L</span>
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-foreground" style={{ fontSize: 13.5, fontWeight: 620, letterSpacing: "-0.02em" }}>
              {orgName}
            </div>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span
                className="text-primary"
                style={{
                  fontFamily: "'Geist Mono', monospace",
                  fontSize: 9,
                  fontWeight: 600,
                  letterSpacing: "0.04em",
                  background: "rgba(46,83,57,0.08)",
                  padding: "1px 5px",
                  borderRadius: 3,
                }}
              >
                {orgPlan}
              </span>
              <span
                className="text-muted-foreground/60"
                style={{
                  fontFamily: "'Geist Mono', monospace",
                  fontSize: 10,
                }}
              >
                {activeCount} active
              </span>
            </div>
          </div>
          <ChevronDown size={14} className="shrink-0 opacity-40 text-muted-foreground/60" />
        </div>

        {/* Search */}
        <div className="flex items-center gap-2 mt-2.5 px-2.5 py-[7px] rounded-[7px] cursor-text bg-accent border">
          <Search size={13} className="text-muted-foreground/60" />
          <span className="text-muted-foreground/60 flex-1" style={{ fontSize: 12.5 }}>Search...</span>
          <kbd
            className="text-muted-foreground/60 bg-muted border"
            style={{
              fontFamily: "'Geist Mono', monospace",
              fontSize: 9.5,
              padding: "1px 5px",
              borderRadius: 3,
            }}
          >
            ⌘K
          </kbd>
        </div>
      </div>

      {/* ── Scrollable Nav ──────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden px-1.5 py-1.5 sidebar-scroll">
        {/* Group 1: Personal */}
        <div className="py-0.5 px-1">
          <NavItemLink href="/dashboard" icon={Home} label="Home" />
          <NavItemLink href="/dashboard/inbox" icon={Inbox} label="Inbox" badge={3} badgeStyle="accent" />
        </div>

        <NavDivider />

        {/* Group 2: Workspace */}
        <div className="py-0.5 px-1">
          <NavItemLink href="/dashboard/requests" icon={Zap} label="Requests" />
          <NavItemLink href="/dashboard/projects" icon={FolderOpen} label="Projects" />
          <NavItemLink href="/dashboard/ideas" icon={Lightbulb} label="Ideas" />
          <NavItemLink href="/dashboard/cycles" icon={Clock} label="Cycles" />
        </div>

        <NavDivider />

        {/* Group 3: Insights + Team */}
        <div className="py-0.5 px-1">
          <NavItemLink href="/dashboard/insights" icon={BarChart3} label="Insights" />
          <NavItemLink href="/dashboard/team" icon={Users} label="Team" />
        </div>

        {/* Pinned Views (only shown if views exist) */}
        {hasPinnedViews && (
          <>
            <NavDivider />
            <SectionLabel label="Pinned Views" />
            <PinnedViews views={pinnedViews!} />
          </>
        )}
      </div>

      {/* ── Footer ──────────────────────────────────────────────── */}
      <div className="shrink-0 border-t">
        {/* New Request button */}
        <button
          className="flex items-center justify-center gap-1.5 mx-3 mt-3 py-2 w-[calc(100%-24px)] rounded-[7px] transition-colors bg-primary text-primary-foreground"
          style={{
            fontFamily: "'Satoshi', sans-serif",
            fontSize: 12.5,
            fontWeight: 560,
            border: "none",
            cursor: "pointer",
            boxShadow: "0 1px 6px rgba(46,83,57,0.15)",
          }}
        >
          <Plus size={14} />
          New Request
        </button>

        {/* Promo / update banner */}
        {banner && !bannerDismissed && (
          <div className="mx-2.5 mt-2.5 p-3 rounded-lg bg-card border">
            <div className="flex items-start justify-between gap-2">
              <span className="text-foreground" style={{ fontSize: 13, fontWeight: 580, lineHeight: 1.3 }}>
                {banner.title}
              </span>
              <button
                onClick={() => setBannerDismissed(true)}
                className="shrink-0 flex items-center justify-center rounded hover:bg-accent transition-colors text-muted-foreground/60"
                style={{ width: 20, height: 20, background: "none", border: "none", cursor: "pointer", marginTop: -2 }}
              >
                <X size={10} />
              </button>
            </div>
            <p className="text-muted-foreground" style={{ fontSize: 12, lineHeight: 1.45, marginTop: 4 }}>
              {banner.description}
            </p>
            <Link
              href={banner.ctaHref}
              className="flex items-center justify-center mt-2.5 py-1.5 rounded-md transition-opacity hover:opacity-85 bg-foreground text-background"
              style={{
                fontSize: 12,
                fontWeight: 560,
                textDecoration: "none",
              }}
            >
              {banner.ctaLabel}
            </Link>
          </div>
        )}

        {/* User */}
        <div className="flex items-center gap-2.5 px-3.5 py-2.5 pb-4">
          <div
            className="flex items-center justify-center rounded-full shrink-0 cursor-pointer text-foreground"
            style={{
              width: 28,
              height: 28,
              background: "linear-gradient(135deg, rgba(46,83,57,0.30), rgba(194,123,158,0.30))",
              fontSize: 10.5,
              fontWeight: 650,
            }}
          >
            {user.initials}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-foreground" style={{ fontSize: 12.5, fontWeight: 530 }}>{user.name}</div>
            <div
              className="text-muted-foreground/60"
              style={{
                fontFamily: "'Geist Mono', monospace",
                fontSize: 10,
                marginTop: 1,
              }}
            >
              {user.role}
            </div>
          </div>
          <div className="flex gap-1 items-center">
            <NotificationsBell userRole={userRole} />
            <Link
              href="/settings"
              className="p-1 rounded opacity-40 hover:opacity-70 hover:bg-accent transition-all"
            >
              <Settings size={14} />
            </Link>
            <form action={logout}>
              <button
                type="submit"
                className="p-1 rounded opacity-40 hover:opacity-70 hover:bg-red-500/10 transition-all"
                style={{ background: "none", border: "none", cursor: "pointer" }}
              >
                <LogOut size={14} />
              </button>
            </form>
          </div>
        </div>
      </div>
    </aside>
  );
}
