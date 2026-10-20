import { Button } from "@/components/arc/button/button";
import { Badge } from "@/components/arc/badge/badge";
import styles from "./settings.module.css";

export function ComingSoonPanel({ description }: { description: string }) {
  return <section className={styles.comingSoon} aria-label="Availability">
    <Badge>Coming soon</Badge>
    <h2>This setting is on its way</h2>
    <p>{description}</p>
    <p>You don’t need to configure anything here yet.</p>
  </section>;
}

export function FutureRow({ title, description, id }: { title: string; description: string; id?: string }) {
  return <div id={id} tabIndex={-1} className={styles.row}>
    <div><strong>{title}</strong><p>{description}</p></div><Badge size="sm">Coming soon</Badge>
  </div>;
}

export function FutureSettings({ entries }: { entries: import("./settings-catalog").SettingsEntry[] }) {
  const groups = [...new Set(entries.map(entry => entry.group))];
  return <section aria-label="Future settings" tabIndex={-1}>
    {groups.map(group => <section className={`${styles.card} ${styles.futureGroup}`} key={group}><h3>{group}</h3><div className={styles.rows}>
      {entries.filter(entry => entry.group === group).map(entry => <div className={styles.row} id={entry.target} tabIndex={-1} key={entry.id}><div><strong>{entry.label}</strong><p>{entry.description}</p></div><Button size="sm" variant="secondary" disabled>Coming soon</Button></div>)}
    </div></section>)}
  </section>;
}
