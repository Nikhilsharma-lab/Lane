"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import styles from "@/components/settings/profile.module.css";

const ITEMS = [
  { href: "/settings/profile", label: "Profile", membersOnly: false },
  { href: "/settings/members", label: "Members", membersOnly: true },
] as const;

export function SettingsNav({ isGuest }: { isGuest: boolean }) {
  const pathname = usePathname();
  return <nav aria-label="Settings" className={styles.nav}>
    {ITEMS.filter((item) => !item.membersOnly || !isGuest).map((item) => <Link key={item.href} href={item.href}
      aria-current={pathname === item.href ? "page" : undefined} className={styles.navLink}>{item.label}</Link>)}
  </nav>;
}
