// components/shell/sidebar.tsx
"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { X } from "lucide-react";
import {
  Home,
  Inbox,
  FileText,
  ArrowRight,
  LayoutGrid,
  Kanban,
  List,
  Lightbulb,
  BarChart3,
  Target,
  Activity,
  Settings,
  LogOut,
  Plus,
  Search,
  ChevronRight,
  ChevronDown,
  StickyNote,
  Clock,
  Layers,
} from "lucide-react";
import { logout } from "@/app/actions/auth";
import { NotificationsBell } from "@/components/notifications/notifications-bell";

// ── Types ────────────────────────────────────────────────────────────────────

interface NavItem {
  href: string;
  icon: React.ComponentType<{ size?: number | string }>;
  label: string;
  badge?: number | string;
  badgeStyle?: "accent" | "warn" | "muted";
  trailing?: string;
}

interface SectionProps {
  label: string;
  count?: number;
  showAdd?: boolean;
  children: React.ReactNode;
  defaultOpen?: boolean;
}

interface SidebarBanner {
  title: string;
  description: string;
  ctaLabel: string;
  ctaHref: string;
}

interface Props {
  user: { initials: string; name: string; role: string };
  userRole?: string;
  orgName: string;
  orgPlan: string;
  activeCount: number;
  banner?: SidebarBanner;
}

// ── Section (collapsible) ────────────────────────────────────────────────────

function Section({ label, count, showAdd, children, defaultOpen = true }: SectionProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="mt-2.5">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 w-full px-2.5 py-1 group"
      >
        <ChevronRight
          size={10}
          className="transition-transform text-[var(--text-tertiary)]"
          style={{ transform: open ? "rotate(90deg)" : undefined, opacity: 0.5 }}
        />
        <span
          className="flex-1 text-left transition-colors group-hover:text-[var(--text-secondary)]"
          style={{
            fontFamily: "'Geist Mono', monospace",
            fontSize: 10,
            fontWeight: 600,
            letterSpacing: "0.06em",
            textTransform: "uppercase",
            color: "var(--text-tertiary)",
          }}
        >
          {label}
        </span>
        {count !== undefined && (
          <span
            style={{
              fontFamily: "'Geist Mono', monospace",
              fontSize: 10,
              color: "var(--text-tertiary)",
            }}
          >
            {count}
          </span>
        )}
        {showAdd && (
          <span className="hidden group-hover:flex opacity-50">
            <Plus size={12} />
          </span>
        )}
      </button>
      {open && <div className="py-0.5 px-1">{children}</div>}
    </div>
  );
}

// ── Nav Item ─────────────────────────────────────────────────────────────────

function NavItemLink({ href, icon: Icon, label, badge, badgeStyle, trailing }: NavItem) {
  const pathname = usePathname();
  const isActive = pathname === href || (href !== "/dashboard" && pathname.startsWith(href));

  return (
    <Link
      href={href}
      className="flex items-center gap-2.5 px-2.5 py-[7px] rounded-[7px] relative transition-colors"
      style={{
        background: isActive ? "var(--bg-hover)" : undefined,
      }}
    >
      {isActive && (
        <span
          className="absolute left-0 top-1/2 -translate-y-1/2 rounded-r"
          style={{ width: 2.5, height: 14, background: "var(--accent)" }}
        />
      )}
      <Icon size={15} />
      <span
        className="flex-1 truncate"
        style={{
          fontSize: 13,
          fontWeight: isActive ? 560 : 460,
          color: isActive ? "var(--text-primary)" : "var(--text-secondary)",
          letterSpacing: "-0.01em",
        }}
      >
        {label}
      </span>
      {badge !== undefined && (
        <span
          className="rounded-full text-center"
          style={{
            fontFamily: "'Geist Mono', monospace",
            fontSize: 10,
            fontWeight: 600,
            padding: "1px 6px",
            minWidth: 16,
            lineHeight: "16px",
            ...(badgeStyle === "accent"
              ? { background: "var(--accent)", color: "#fff" }
              : badgeStyle === "warn"
              ? { background: "rgba(212,168,75,0.12)", color: "#D4A84B" }
              : { background: "var(--bg-hover)", color: "var(--text-secondary)", border: "1px solid var(--border)" }),
          }}
        >
          {badge}
        </span>
      )}
      {trailing && (
        <span
          style={{
            fontFamily: "'Geist Mono', monospace",
            fontSize: 10,
            color: "var(--text-tertiary)",
          }}
        >
          {trailing}
        </span>
      )}
    </Link>
  );
}

// ── Sidebar ──────────────────────────────────────────────────────────────────

export function Sidebar({ user, userRole, orgName, orgPlan, activeCount, banner }: Props) {
  const [bannerDismissed, setBannerDismissed] = useState(false);

  return (
    <aside
      className="flex flex-col shrink-0 select-none"
      style={{
        width: 256,
        minWidth: 256,
        height: "100vh",
        background: "var(--bg-subtle)",
        borderRight: "1px solid var(--border)",
        position: "sticky",
        top: 0,
        zIndex: 20,
      }}
    >
      {/* ── Header ──────────────────────────────────────────────── */}
      <div className="px-3.5 pt-4 pb-3 border-b" style={{ borderColor: "var(--border)" }}>
        <div className="flex items-center gap-2.5 px-1.5 py-1 rounded-lg cursor-pointer hover:bg-[var(--bg-hover)] transition-colors">
          <div
            className="flex items-center justify-center rounded-[7px] shrink-0"
            style={{
              width: 28,
              height: 28,
              background: "var(--accent)",
              boxShadow: "0 1px 4px rgba(46,83,57,0.15)",
            }}
          >
            <span style={{ fontSize: 12, fontWeight: 700, color: "#fff" }}>L</span>
          </div>
          <div className="flex-1 min-w-0">
            <div style={{ fontSize: 13.5, fontWeight: 620, color: "var(--text-primary)", letterSpacing: "-0.02em" }}>
              {orgName}
            </div>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span
                style={{
                  fontFamily: "'Geist Mono', monospace",
                  fontSize: 9,
                  fontWeight: 600,
                  letterSpacing: "0.04em",
                  color: "var(--accent)",
                  background: "rgba(46,83,57,0.08)",
                  padding: "1px 5px",
                  borderRadius: 3,
                }}
              >
                {orgPlan}
              </span>
              <span
                style={{
                  fontFamily: "'Geist Mono', monospace",
                  fontSize: 10,
                  color: "var(--text-tertiary)",
                }}
              >
                {activeCount} active
              </span>
            </div>
          </div>
          <ChevronDown size={14} className="shrink-0 opacity-40" style={{ color: "var(--text-tertiary)" }} />
        </div>

        {/* Search */}
        <div
          className="flex items-center gap-2 mt-2.5 px-2.5 py-[7px] rounded-[7px] cursor-text"
          style={{
            background: "var(--bg-hover)",
            border: "1px solid var(--border)",
          }}
        >
          <Search size={13} style={{ color: "var(--text-tertiary)" }} />
          <span style={{ fontSize: 12.5, color: "var(--text-tertiary)", flex: 1 }}>Search...</span>
          <kbd
            style={{
              fontFamily: "'Geist Mono', monospace",
              fontSize: 9.5,
              color: "var(--text-tertiary)",
              background: "var(--bg-subtle)",
              border: "1px solid var(--border)",
              padding: "1px 5px",
              borderRadius: 3,
            }}
          >
            ⌘K
          </kbd>
        </div>
      </div>

      {/* ── Scrollable ──────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden px-1.5 py-1.5 sidebar-scroll">
        {/* Personal */}
        <Section label="Personal">
          <NavItemLink href="/dashboard" icon={Home} label="My Work" />
          <NavItemLink href="/dashboard/inbox" icon={Inbox} label="Inbox" badge={3} badgeStyle="accent" />
          <NavItemLink href="/dashboard/drafts" icon={FileText} label="Drafts" />
          <NavItemLink href="/dashboard/stickies" icon={StickyNote} label="Stickies" />
        </Section>

        {/* Workspace */}
        <Section label="Workspace">
          <NavItemLink href="/dashboard/intake" icon={Inbox} label="Intake" />
          <NavItemLink href="/dashboard/journey" icon={ArrowRight} label="Journey View" />
          <NavItemLink href="/dashboard/betting" icon={LayoutGrid} label="Betting Board" />
          <NavItemLink href="/dashboard/dev" icon={Kanban} label="Dev Board" />
          <NavItemLink href="/dashboard" icon={List} label="All Requests" />
          <NavItemLink href="/dashboard/ideas" icon={Lightbulb} label="Idea Board" />
          <NavItemLink href="/dashboard/cycles" icon={Clock} label="Cycles" />
          <NavItemLink href="/dashboard/initiatives" icon={Layers} label="Initiatives" />
        </Section>

        {/* Insights */}
        <Section label="Insights">
          <NavItemLink href="/dashboard/insights" icon={BarChart3} label="Capacity" />
          <NavItemLink href="/dashboard/insights/impact" icon={Target} label="Impact" />
          <NavItemLink href="/dashboard/radar" icon={Activity} label="Team Health" />
          <NavItemLink href="/dashboard/team" icon={Activity} label="Team" />
        </Section>
      </div>

      {/* ── Footer ──────────────────────────────────────────────── */}
      <div className="shrink-0 border-t" style={{ borderColor: "var(--border)" }}>
        {/* New Request button */}
        <button
          className="flex items-center justify-center gap-1.5 mx-3 mt-3 py-2 w-[calc(100%-24px)] rounded-[7px] transition-colors"
          style={{
            background: "var(--accent)",
            color: "#fff",
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
          <div
            className="mx-2.5 mt-2.5 p-3 rounded-lg"
            style={{
              background: "var(--bg-surface)",
              border: "1px solid var(--border)",
            }}
          >
            <div className="flex items-start justify-between gap-2">
              <span style={{ fontSize: 13, fontWeight: 580, color: "var(--text-primary)", lineHeight: 1.3 }}>
                {banner.title}
              </span>
              <button
                onClick={() => setBannerDismissed(true)}
                className="shrink-0 flex items-center justify-center rounded hover:bg-[var(--bg-hover)] transition-colors"
                style={{ width: 20, height: 20, background: "none", border: "none", cursor: "pointer", color: "var(--text-tertiary)", marginTop: -2 }}
              >
                <X size={10} />
              </button>
            </div>
            <p style={{ fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.45, marginTop: 4 }}>
              {banner.description}
            </p>
            <Link
              href={banner.ctaHref}
              className="flex items-center justify-center mt-2.5 py-1.5 rounded-md transition-opacity hover:opacity-85"
              style={{
                background: "var(--text-primary)",
                color: "var(--bg-surface)",
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
            className="flex items-center justify-center rounded-full shrink-0 cursor-pointer"
            style={{
              width: 28,
              height: 28,
              background: "linear-gradient(135deg, rgba(46,83,57,0.30), rgba(194,123,158,0.30))",
              fontSize: 10.5,
              fontWeight: 650,
              color: "var(--text-primary)",
            }}
          >
            {user.initials}
          </div>
          <div className="flex-1 min-w-0">
            <div style={{ fontSize: 12.5, fontWeight: 530, color: "var(--text-primary)" }}>{user.name}</div>
            <div
              style={{
                fontFamily: "'Geist Mono', monospace",
                fontSize: 10,
                color: "var(--text-tertiary)",
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
              className="p-1 rounded opacity-40 hover:opacity-70 hover:bg-[var(--bg-hover)] transition-all"
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
