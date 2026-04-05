"use client";

import React, { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Home,
  Inbox,
  FileText,
  ArrowRight,
  LayoutGrid,
  Columns,
  List,
  Star,
  BarChart3,
  Target,
  Activity,
  Plus,
  Search,
  Settings,
  ChevronRight,
  ChevronDown,
  type LucideIcon,
} from "lucide-react";
import type { Profile, Organization } from "@/db/schema";

/* ── Types ───────────────────────────────────────────────── */

interface SidebarProps {
  profile: Profile;
  org: Organization;
  activeRequestCount: number;
  inboxCount?: number;
  bettingBoardCount?: number;
  /** Morning briefing data — only shown for lead/admin */
  briefing?: {
    decisions: number;
    toTriage: number;
    hasWarning: boolean;
  };
}

/* ── Chevron icon (reusable) ─────────────────────────────── */

function SectionChevron({ open }: { open: boolean }) {
  return (
    <ChevronRight
      size={10}
      className="transition-transform duration-100"
      style={{
        color: "var(--text-muted)",
        opacity: 0.5,
        transform: open ? "rotate(90deg)" : "rotate(0deg)",
      }}
    />
  );
}

/* ── Nav item ────────────────────────────────────────────── */

function NavItem({
  href,
  icon: Icon,
  label,
  isActive,
  badge,
  badgeVariant = "accent",
  trailingText,
  indent = false,
}: {
  href: string;
  icon: LucideIcon;
  label: string;
  isActive: boolean;
  badge?: number;
  badgeVariant?: "accent" | "warning" | "muted";
  trailingText?: string;
  indent?: boolean;
}) {
  const badgeStyles = {
    accent: { background: "var(--accent)", color: "#fff" },
    warning: { background: "rgba(212,168,75,0.12)", color: "var(--amber)" },
    muted: { background: "var(--bg-hover)", color: "var(--text-secondary)", border: "1px solid var(--border)" },
  };

  return (
    <Link
      href={href}
      className="group flex items-center gap-[9px] rounded-[7px] relative transition-colors"
      style={{
        padding: indent ? "7px 10px 7px 36px" : "7px 10px",
        background: isActive ? "var(--bg-active)" : undefined,
      }}
      onMouseEnter={(e) => {
        if (!isActive) e.currentTarget.style.background = "var(--bg-hover)";
      }}
      onMouseLeave={(e) => {
        if (!isActive) e.currentTarget.style.background = "";
      }}
    >
      {/* Active indicator bar */}
      {isActive && (
        <span
          className="absolute left-0 top-1/2 -translate-y-1/2 rounded-r-sm"
          style={{
            width: 2.5,
            height: 14,
            background: "var(--accent)",
          }}
        />
      )}

      <Icon size={15} className="shrink-0" color={isActive ? "var(--accent)" : "var(--text-muted)"} />

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

      {badge !== undefined && badge > 0 && (
        <span
          className="text-center"
          style={{
            fontFamily: "'Geist Mono', monospace",
            fontSize: 10,
            fontWeight: 600,
            padding: "1px 6px",
            borderRadius: 10,
            minWidth: 16,
            lineHeight: "16px",
            ...badgeStyles[badgeVariant],
          }}
        >
          {badge}
        </span>
      )}

      {trailingText && (
        <span
          style={{
            fontFamily: "'Geist Mono', monospace",
            fontSize: 10,
            color: "var(--text-dim)",
          }}
        >
          {trailingText}
        </span>
      )}
    </Link>
  );
}

/* ── Collapsible section ─────────────────────────────────── */

function Section({
  label,
  count,
  showAdd = false,
  defaultOpen = true,
  children,
}: {
  label: string;
  count?: number;
  showAdd?: boolean;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div style={{ marginTop: 10 }}>
      <button
        onClick={() => setOpen(!open)}
        className="group flex items-center gap-[5px] w-full"
        style={{ padding: "5px 10px", background: "none", border: "none", cursor: "pointer" }}
      >
        <SectionChevron open={open} />
        <span
          style={{
            fontFamily: "'Geist Mono', monospace",
            fontSize: 10,
            fontWeight: 600,
            letterSpacing: "0.06em",
            textTransform: "uppercase",
            color: "var(--text-muted)",
            flex: 1,
            textAlign: "left",
            transition: "color 0.1s",
          }}
          className="group-hover:!text-[var(--text-secondary)]"
        >
          {label}
        </span>

        {count !== undefined && (
          <span
            style={{
              fontFamily: "'Geist Mono', monospace",
              fontSize: 10,
              color: "var(--text-dim)",
            }}
          >
            {count}
          </span>
        )}

        {showAdd && (
          <span
            className="hidden group-hover:flex items-center"
            style={{ opacity: 0.5, padding: 2, borderRadius: 3 }}
          >
            <Plus size={12} style={{ color: "var(--text-muted)" }} />
          </span>
        )}
      </button>

      {open && <div style={{ padding: "2px 4px" }}>{children}</div>}
    </div>
  );
}

/* ── Team block ──────────────────────────────────────────── */

function TeamBlock({
  name,
  color,
  letterMark,
  count,
  warningBadge,
  hasNotification = false,
  defaultExpanded = false,
  children,
}: {
  name: string;
  color: string;
  letterMark: string;
  count: number;
  warningBadge?: number;
  hasNotification?: boolean;
  defaultExpanded?: boolean;
  children?: React.ReactNode;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);

  return (
    <div>
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-[7px] w-full rounded-[7px] transition-colors hover:bg-[var(--bg-hover)]"
        style={{ padding: "6px 10px", background: "none", border: "none", cursor: "pointer" }}
      >
        <ChevronRight
          size={10}
          className="transition-transform duration-100"
          style={{
            color: "var(--text-dim)",
            opacity: 0.35,
            transform: expanded ? "rotate(90deg)" : "rotate(0deg)",
          }}
        />

        <div
          className="flex items-center justify-center shrink-0"
          style={{
            width: 17,
            height: 17,
            borderRadius: 4,
            background: `${color}16`,
          }}
        >
          <span style={{ fontSize: 9, fontWeight: 700, color }}>{letterMark}</span>
        </div>

        <span
          className="flex-1 text-left"
          style={{
            fontSize: 13,
            fontWeight: 480,
            color: "var(--text-secondary)",
            letterSpacing: "-0.01em",
          }}
        >
          {name}
        </span>

        {warningBadge !== undefined && warningBadge > 0 && (
          <span
            style={{
              fontFamily: "'Geist Mono', monospace",
              fontSize: 10,
              fontWeight: 600,
              padding: "1px 6px",
              borderRadius: 10,
              minWidth: 16,
              textAlign: "center",
              lineHeight: "16px",
              background: "rgba(212,168,75,0.12)",
              color: "var(--amber)",
            }}
          >
            {warningBadge}
          </span>
        )}

        {hasNotification && (
          <span
            className="shrink-0"
            style={{
              width: 5,
              height: 5,
              borderRadius: "50%",
              background: "var(--blue)",
            }}
          />
        )}

        <span
          style={{
            fontFamily: "'Geist Mono', monospace",
            fontSize: 10,
            color: "var(--text-dim)",
          }}
        >
          {count}
        </span>
      </button>

      {expanded && children}
    </div>
  );
}

/* ── Project row ─────────────────────────────────────────── */

function ProjectRow({
  emoji,
  name,
  count,
  hot = false,
  atRisk = false,
}: {
  emoji: string;
  name: string;
  count: number;
  hot?: boolean;
  atRisk?: boolean;
}) {
  return (
    <div
      className="flex items-center gap-[7px] rounded-[7px] cursor-pointer transition-colors hover:bg-[var(--bg-hover)]"
      style={{ padding: "6px 10px 6px 44px" }}
    >
      <span style={{ fontSize: 13, lineHeight: 1, flexShrink: 0 }}>{emoji}</span>
      <span
        className="flex-1 truncate"
        style={{
          fontSize: 12.5,
          fontWeight: 440,
          color: "var(--text-secondary)",
        }}
      >
        {name}
      </span>
      {atRisk && (
        <span
          className="shrink-0"
          style={{
            width: 5,
            height: 5,
            borderRadius: "50%",
            background: "var(--amber)",
          }}
        />
      )}
      <span
        style={{
          fontFamily: "'Geist Mono', monospace",
          fontSize: 10,
          color: hot ? "var(--amber)" : "var(--text-dim)",
        }}
      >
        {count}
      </span>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════
   SIDEBAR (Main export)
══════════════════════════════════════════════════════════ */

export function Sidebar({
  profile,
  org,
  activeRequestCount,
  inboxCount = 0,
  bettingBoardCount = 0,
  briefing,
}: SidebarProps) {
  const pathname = usePathname();
  const isLeadOrAdmin = profile.role === "lead" || profile.role === "admin";
  const initials = profile.fullName
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <aside
      className="flex flex-col select-none shrink-0"
      style={{
        width: "var(--sidebar-width)",
        minWidth: "var(--sidebar-width)",
        height: "100vh",
        background: "var(--bg-sidebar)",
        borderRight: "1px solid var(--border)",
        position: "sticky",
        top: 0,
        zIndex: 20,
        overflow: "hidden",
      }}
    >
      {/* ── Header ──────────────────────────────────────── */}
      <div
        className="shrink-0"
        style={{
          padding: "16px 14px 12px",
          borderBottom: "1px solid var(--border-subtle)",
        }}
      >
        {/* Workspace identity */}
        <div
          className="flex items-center gap-[10px] cursor-pointer rounded-lg"
          style={{ padding: "5px 6px" }}
          onMouseEnter={(e) => (e.currentTarget.style.background = "var(--bg-hover)")}
          onMouseLeave={(e) => (e.currentTarget.style.background = "")}
        >
          <div
            className="flex items-center justify-center shrink-0"
            style={{
              width: 28,
              height: 28,
              borderRadius: 7,
              background: "var(--accent)",
              boxShadow: "0 1px 4px rgba(46,83,57,0.15)",
            }}
          >
            <span style={{ fontSize: 12, fontWeight: 700, color: "#fff" }}>L</span>
          </div>

          <div className="flex-1 min-w-0">
            <div
              style={{
                fontSize: 13.5,
                fontWeight: 620,
                color: "var(--text-primary)",
                letterSpacing: "-0.02em",
              }}
            >
              Lane
            </div>
            <div className="flex items-center gap-1.5" style={{ marginTop: 2 }}>
              <span
                style={{
                  fontFamily: "'Geist Mono', monospace",
                  fontSize: 9,
                  fontWeight: 600,
                  letterSpacing: "0.04em",
                  color: "var(--accent)",
                  background: "var(--accent-soft)",
                  padding: "1px 5px",
                  borderRadius: 3,
                }}
              >
                {org.plan?.toUpperCase() ?? "FREE"}
              </span>
              <span
                style={{
                  fontFamily: "'Geist Mono', monospace",
                  fontSize: 10,
                  color: "var(--text-muted)",
                }}
              >
                {activeRequestCount} active
              </span>
            </div>
          </div>

          <ChevronDown
            size={14}
            style={{ color: "var(--text-dim)", opacity: 0.6, flexShrink: 0 }}
          />
        </div>

        {/* Search */}
        <div
          className="flex items-center gap-2 cursor-text"
          style={{
            padding: "7px 10px",
            borderRadius: 7,
            background: "var(--bg-input)",
            border: "1px solid var(--border)",
            marginTop: 10,
          }}
        >
          <Search size={13} style={{ color: "var(--text-dim)" }} />
          <span
            className="flex-1"
            style={{ fontSize: 12.5, color: "var(--text-dim)" }}
          >
            Search...
          </span>
          <kbd
            style={{
              fontFamily: "'Geist Mono', monospace",
              fontSize: 9.5,
              color: "var(--text-dim)",
              background: "var(--bg-sidebar)",
              border: "1px solid var(--border)",
              padding: "1px 5px",
              borderRadius: 3,
            }}
          >
            ⌘K
          </kbd>
        </div>
      </div>

      {/* ── Scrollable body ─────────────────────────────── */}
      <div
        className="flex-1 overflow-y-auto overflow-x-hidden"
        style={{ padding: "6px 6px" }}
      >
        {/* Morning Briefing (lead/admin only) */}
        {isLeadOrAdmin && briefing && (
          <div
            className="flex items-center gap-[9px] cursor-pointer transition-[border-color] duration-100"
            style={{
              padding: "9px 11px",
              margin: "4px 4px 8px",
              borderRadius: 8,
              background: "var(--bg-surface)",
              border: "1px solid var(--border)",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.borderColor = "var(--accent-med)")}
            onMouseLeave={(e) => (e.currentTarget.style.borderColor = "var(--border)")}
          >
            <div
              className="flex items-center justify-center shrink-0"
              style={{
                width: 24,
                height: 24,
                borderRadius: 6,
                background: "var(--accent-soft)",
              }}
            >
              <Star size={13} style={{ color: "var(--accent)", fill: "none" }} />
            </div>
            <div className="flex-1">
              <div style={{ fontSize: 12.5, fontWeight: 560, color: "var(--text-primary)" }}>
                Morning Briefing
              </div>
              <div
                style={{
                  fontFamily: "'Geist Mono', monospace",
                  fontSize: 10,
                  color: "var(--text-muted)",
                  marginTop: 2,
                }}
              >
                {briefing.decisions} decisions · {briefing.toTriage} to triage
              </div>
            </div>
            <span
              className="shrink-0"
              style={{
                width: 7,
                height: 7,
                borderRadius: "50%",
                background: briefing.hasWarning ? "var(--amber)" : "var(--green)",
              }}
            />
          </div>
        )}

        {/* ── Personal ──────────────────────────────────── */}
        <Section label="Personal">
          <NavItem
            href="/dashboard"
            icon={Home}
            label="My Work"
            isActive={pathname === "/dashboard"}
          />
          <NavItem
            href="/dashboard/inbox"
            icon={Inbox}
            label="Inbox"
            isActive={pathname === "/dashboard/inbox"}
            badge={inboxCount}
            badgeVariant="accent"
          />
          <NavItem
            href="/dashboard/drafts"
            icon={FileText}
            label="Drafts"
            isActive={pathname === "/dashboard/drafts"}
          />
        </Section>

        {/* ── Workspace ─────────────────────────────────── */}
        <Section label="Workspace">
          <NavItem
            href="/dashboard/journey"
            icon={ArrowRight}
            label="Journey View"
            isActive={pathname === "/dashboard/journey"}
          />
          <NavItem
            href="/dashboard/betting"
            icon={LayoutGrid}
            label="Betting Board"
            isActive={pathname === "/dashboard/betting"}
            badge={bettingBoardCount}
            badgeVariant="accent"
          />
          <NavItem
            href="/dashboard/dev"
            icon={Columns}
            label="Dev Board"
            isActive={pathname === "/dashboard/dev"}
          />
          <NavItem
            href="/dashboard"
            icon={List}
            label="All Requests"
            isActive={false}
            trailingText={String(activeRequestCount)}
          />
        </Section>

        {/* ── Favorites ─────────────────────────────────── */}
        <Section label="Favorites" count={3} showAdd>
          {/* Placeholder favorites — will be dynamic later */}
          <NavItem
            href="#"
            icon={Star}
            label="💳 Checkout Redesign"
            isActive={false}
          />
          <NavItem
            href="#"
            icon={Star}
            label="Cart Abandonment Fix"
            isActive={false}
          />
          <NavItem
            href="#"
            icon={Star}
            label="My High-Priority"
            isActive={false}
          />
        </Section>

        {/* ── Teams ─────────────────────────────────────── */}
        <Section label="Teams" count={4} showAdd>
          <TeamBlock
            name="Payments"
            color="#6e5ff5"
            letterMark="P"
            count={4}
            warningBadge={2}
            defaultExpanded
          >
            <div>
              <NavItem href="#" icon={Inbox} label="Triage" isActive={false} badge={2} badgeVariant="accent" indent />
              <NavItem href="#" icon={Activity} label="Active Streams" isActive={false} trailingText="9" indent />
              <ProjectRow emoji="💳" name="Checkout Redesign" count={5} hot />
              <ProjectRow emoji="⚡" name="UPI Lite Experience" count={3} atRisk />
              <ProjectRow emoji="📄" name="Bill Payments Flow" count={1} />
            </div>
          </TeamBlock>

          <TeamBlock name="Lending" color="#ec4899" letterMark="L" count={3} />
          <TeamBlock name="KYC & Onboarding" color="#14b8a6" letterMark="K" count={2} warningBadge={1} hasNotification />
          <TeamBlock name="Cards" color="#f59e0b" letterMark="C" count={2} />
        </Section>

        {/* ── Insights (lead/admin only) ────────────────── */}
        {isLeadOrAdmin && (
          <Section label="Insights">
            <NavItem
              href="/dashboard/capacity"
              icon={BarChart3}
              label="Capacity"
              isActive={pathname === "/dashboard/capacity"}
            />
            <NavItem
              href="/dashboard/insights"
              icon={Target}
              label="Impact"
              isActive={pathname === "/dashboard/insights"}
            />
            <NavItem
              href="/dashboard/team"
              icon={Activity}
              label="Team Health"
              isActive={pathname === "/dashboard/team"}
            />
          </Section>
        )}
      </div>

      {/* ── Footer ──────────────────────────────────────── */}
      <div className="shrink-0" style={{ borderTop: "1px solid var(--border-subtle)" }}>
        {/* New Request button */}
        <Link
          href="/dashboard/requests/new"
          className="flex items-center justify-center gap-1.5 transition-colors"
          style={{
            margin: "12px 12px 0",
            padding: "8px 0",
            borderRadius: 7,
            background: "var(--accent)",
            color: "#fff",
            fontSize: 12.5,
            fontWeight: 560,
            boxShadow: "0 1px 6px rgba(46,83,57,0.15)",
            textDecoration: "none",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = "var(--accent-bright)")}
          onMouseLeave={(e) => (e.currentTarget.style.background = "var(--accent)")}
        >
          <Plus size={14} />
          New Request
        </Link>

        {/* User profile */}
        <div className="flex items-center gap-[9px]" style={{ padding: "10px 14px 16px" }}>
          <div
            className="flex items-center justify-center shrink-0 cursor-pointer"
            style={{
              width: 28,
              height: 28,
              borderRadius: "50%",
              background: "linear-gradient(135deg, rgba(46,83,57,0.30), rgba(194,123,158,0.30))",
              fontSize: 10.5,
              fontWeight: 650,
              color: "var(--text-primary)",
            }}
          >
            {initials}
          </div>
          <div className="flex-1 min-w-0">
            <div style={{ fontSize: 12.5, fontWeight: 530, color: "var(--text-primary)" }}>
              {profile.fullName}
            </div>
            <div
              style={{
                fontFamily: "'Geist Mono', monospace",
                fontSize: 10,
                color: "var(--text-muted)",
                marginTop: 1,
                textTransform: "capitalize",
              }}
            >
              {profile.role}
            </div>
          </div>
          <Link
            href="/settings"
            className="flex items-center rounded transition-opacity"
            style={{ padding: 4, opacity: 0.4 }}
            onMouseEnter={(e) => {
              e.currentTarget.style.opacity = "0.7";
              e.currentTarget.style.background = "var(--bg-hover)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.opacity = "0.4";
              e.currentTarget.style.background = "";
            }}
          >
            <Settings size={14} style={{ color: "var(--text-muted)" }} />
          </Link>
        </div>
      </div>
    </aside>
  );
}
