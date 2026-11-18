import Link from "@/components/link";
import { ArrowLeft, Search } from "lucide-react";
import { KeyCap } from "@/components/keyboard/key-caps";
import { Placeholder } from "@/components/loading/placeholder";
import { settingsCatalog, settingsNavigation } from "./settings-catalog";
import { SettingsLoadingSection } from "./settings-loading-section";
import styles from "./settings.module.css";
import loading from "./settings-loading.module.css";

// Every section the frame can open, by its heading; "coming-soon" collects the planned ones. Read here, on the
// server, so the loading frame's own code carries only the few words it shows, not the catalog.
const TITLES = Object.fromEntries(settingsNavigation("admin").map(entry => [entry.id, entry.label]));
const PLANNED = settingsCatalog.filter(entry => entry.soon).map(entry => entry.id);
/**
 * Rows per group, as each section draws them: the placeholder takes the shape of what is opening. Written out by
 * hand; change a count here when its panel changes: profile, AccountProfile's rows and the Role row; preferences,
 * ThemePreference; inbox-delivery, InboxDeliveryForm; account-security, AccountSecurity; workspace, the adapter's
 * Workspace details group; members, WorkspaceMembersView's People and Pending invitations; metrics,
 * MetricDefinitionList; slack, SlackConnectionCard; billing, billingPanel's plan and Free Requests cards;
 * coming-soon, FutureSettings.
 */
const SHAPES: Record<string, number[]> = {
  profile: [4], preferences: [1], "inbox-delivery": [3], "account-security": [2], workspace: [4],
  members: [4, 2], metrics: [5], slack: [2], billing: [3, 1], "coming-soon": [3, 3],
};
const CLASSES = { section: styles.section, sectionHead: styles.sectionHead, group: styles.group, groupBox: styles.groupBox, groupRow: styles.groupRow };

/**
 * #288 (D22): Settings while a page loads. The header keeps its back arrow and search, the heading names the section
 * that is opening (the address's `section` when it names one, else the page's own `section`), and the placeholders
 * are that section's row groups, on Build 2's placeholder timing (`Placeholder`). Nothing moves when the page arrives.
 */
export function SettingsLoading({ section, label }: { section: string; label: string }) {
  return <div className={styles.frame} aria-busy="true">
    <header className={styles.header}>
      <div className={styles.heading}><Link href="/" className={styles.back} aria-label="Back to Requests"><ArrowLeft aria-hidden="true" /></Link><h1>Settings</h1></div>
      <button className={styles.searchTrigger} type="button" disabled aria-keyshortcuts="/"><Search aria-hidden="true" /><span>Search settings</span><KeyCap className={styles.searchKey}>/</KeyCap></button>
    </header>
    <aside className={styles.sidebar}>
      <Placeholder><div className={loading.loadingNav} aria-hidden="true">{[0, 1, 2, 3, 4, 5].map(index => <span key={index} />)}</div></Placeholder>
    </aside>
    <div className={styles.content}><div className={styles.page}>
      <SettingsLoadingSection section={section} label={label} titles={TITLES} planned={PLANNED} shapes={SHAPES} classes={CLASSES} />
    </div></div>
  </div>;
}
