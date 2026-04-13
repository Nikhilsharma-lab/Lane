"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Layers,
  InboxIcon,
  LayoutGrid,
  ShieldCheck,
  Archive,
  ChevronRight,
} from "lucide-react";
import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarMenuBadge,
} from "@/components/ui/sidebar";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { NavBadge } from "./badge";
import type { SidebarTeam } from "@/lib/nav/types";

interface Props {
  team: SidebarTeam;
  defaultOpen?: boolean;
}

export function TeamSection({ team, defaultOpen = true }: Props) {
  const pathname = usePathname();
  const base = `/dashboard/teams/${team.slug ?? team.id}`;

  const items = [
    {
      href: `${base}/streams`,
      icon: Layers,
      label: "Active streams",
      badge: team.streamCounts.active > 0 ? { tier: 2 as const, value: team.streamCounts.active } : null,
    },
    {
      href: `${base}/intake`,
      icon: InboxIcon,
      label: "Intake queue",
      badge: team.streamCounts.intake > 0 ? { tier: 2 as const, value: team.streamCounts.intake } : null,
    },
    {
      href: `${base}/commitments`,
      icon: LayoutGrid,
      label: "Commitments",
      badge: null,
    },
    {
      href: `${base}/validation`,
      icon: ShieldCheck,
      label: "Validation gate",
      badge: team.streamCounts.validation > 0 ? { tier: 1 as const, value: team.streamCounts.validation } : null,
    },
    {
      href: `${base}/archive`,
      icon: Archive,
      label: "Archive",
      badge: null,
    },
  ];

  return (
    <Collapsible defaultOpen={defaultOpen} className="group/collapsible">
      <SidebarGroup>
        <SidebarGroupLabel>
          <CollapsibleTrigger className="flex w-full items-center gap-2">
            <ChevronRight className="size-3.5 transition-transform group-data-[state=open]/collapsible:rotate-90" />
            <span className="truncate">{team.name}</span>
            {!defaultOpen && team.streamCounts.total > 0 && (
              <NavBadge tier={3} value={1} className="ml-auto" />
            )}
          </CollapsibleTrigger>
        </SidebarGroupLabel>
        <CollapsibleContent>
          <SidebarGroupContent>
            <SidebarMenu>
              {items.map((item) => {
                const isActive = pathname.startsWith(item.href);
                return (
                  <SidebarMenuItem key={item.href}>
                    <Link href={item.href} className="contents">
                      <SidebarMenuButton isActive={isActive} tooltip={item.label}>
                        <item.icon className="size-4" />
                        <span>{item.label}</span>
                      </SidebarMenuButton>
                    </Link>
                    {item.badge && (
                      <SidebarMenuBadge>
                        <NavBadge tier={item.badge.tier} value={item.badge.value} />
                      </SidebarMenuBadge>
                    )}
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </CollapsibleContent>
      </SidebarGroup>
    </Collapsible>
  );
}
