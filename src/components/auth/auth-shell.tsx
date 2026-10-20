import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import styles from "./auth.module.css";

export function LaneMark() {
  return <span className={styles.mark}><svg aria-hidden="true" viewBox="0 0 100 100"><path d="M0 100V0H93.2753L0 100Z" /><path d="M0 100H100V6.7247L0 100Z" /></svg><span>Lane</span></span>;
}

/** `concealed` keeps the link's place in the header but hides it from sight, the tab order and assistive tech. */
export function AuthHeaderLink({ prompt, href, label, concealed = false }: { prompt: string; href: string; label: string; concealed?: boolean }) {
  return <div className={styles.headerLink} data-concealed={concealed || undefined}><span>{prompt}</span><Link href={href} className={styles.link}>{label}</Link></div>;
}

export function AuthShell({ children, headerAction, footer }: { children: ReactNode; headerAction?: ReactNode; footer?: ReactNode }) {
  return <div className={styles.shell}>
    <header className={styles.header}><Link href="/login" aria-label="Lane sign in" className={styles.link}><LaneMark /></Link>{headerAction}</header>
    <main className={styles.main}><div className={styles.column}>{children}{footer}</div></main>
  </div>;
}

export function AuthHeading({ title, description }: { title: string; description: ReactNode }) {
  return <div className={styles.heading}><h1 className={styles.title}>{title}</h1><div className={styles.description}>{description}</div></div>;
}

export function AuthTrust({ icon: Icon, children, className }: { icon: LucideIcon; children: ReactNode; className?: string }) {
  return <div className={cn(styles.trust, className)}><Icon aria-hidden="true" data-icon-size="sm" /><span>{children}</span></div>;
}
