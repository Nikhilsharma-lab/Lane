import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import styles from "./settings.module.css";
import { Placeholder } from "@/components/loading/placeholder";

export function SettingsLoading({ title, label }: { title: string; label: string }) {
  return <div className={styles.frame}>
    <header className={styles.header}><div className={styles.heading}><h1>Settings</h1></div></header>
    <aside className={styles.sidebar}>
      <Link href="/" className={styles.back}><ArrowLeft aria-hidden="true" /> Back to Requests</Link>
      <span className={styles.workspaceFooter}>Settings</span>
    </aside>
    <div className={styles.content}><div className={styles.page}>
      <header className={styles.sectionHead}><h2>{title}</h2></header>
      <Placeholder label={label} avatar lines={6} />
    </div></div>
  </div>;
}
