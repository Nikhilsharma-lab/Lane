import Link from "@/components/link";
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { clsx } from "clsx";
import { LaneMark } from "@/components/brand/lane-mark";
import styles from "./auth.module.css";

export function AuthHeaderLink({ prompt, href, label }: { prompt: string; href: string; label: string }) {
  return <div className={styles.headerLink}><span>{prompt}</span><Link href={href} className={styles.link}>{label}</Link></div>;
}

export function AuthShell({ children, headerAction, footer }: { children: ReactNode; headerAction?: ReactNode; footer?: ReactNode }) {
  return <div className={styles.shell}>
    <header className={styles.header}><Link href="/login" aria-label="Lane sign in" className={styles.link}><LaneMark /></Link>{headerAction}</header>
    <main className={styles.main}><div className={styles.column}>{children}{footer}<nav aria-label="Legal" className={styles.legal}><Link href="/privacy" className={styles.link}>Privacy policy</Link><Link href="/terms" className={styles.link}>Terms of service</Link></nav></div></main>
  </div>;
}

export function AuthHeading({ title, description }: { title: string; description: ReactNode }) {
  return <div className={styles.heading}><h1 className={styles.title}>{title}</h1><div className={styles.description}>{description}</div></div>;
}

export function AuthTrust({ icon: Icon, children, className }: { icon: LucideIcon; children: ReactNode; className?: string }) {
  return <div className={clsx(styles.trust, className)}><Icon aria-hidden="true" data-icon-size="sm" /><span>{children}</span></div>;
}
