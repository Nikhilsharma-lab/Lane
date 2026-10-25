/* Search ranking adapted from licensed Arc Pro Settings Command, for Lane only. */
import type { SettingDefinition, Result } from "@/components/arc/blocks/settings-command/settings-command";

/** `href` marks a section with a page of its own (it loads its own data); every other section shows on Profile's page. */
/** `membersOnly` hides a section from Guests; `changersOnly` also from Viewers (#210), who manage no people and get no Needs-you items. */
export type SettingsEntry = SettingDefinition & { adminOnly?: boolean; membersOnly?: boolean; changersOnly?: boolean; href?: string };
export const settingsCatalog: SettingsEntry[] = [
  { id: "profile", section: "profile", group: "Personal", label: "Profile", description: "Your personal details and role.", keywords: ["account", "name", "email", "photo", "avatar"] },
  { id: "role", section: "profile", group: "Personal", label: "Role", description: "Your PM, Designer, or Developer label.", target: "role", keywords: ["designer", "developer", "pm"] },
  { id: "preferences", section: "preferences", group: "Personal", label: "Preferences", description: "Make Lane feel right for you." },
  { id: "theme", section: "preferences", group: "Personal", label: "Theme", description: "System, Light, or Dark for this browser.", target: "theme", keywords: ["appearance", "dark mode", "light mode"] },
  { id: "inbox-delivery", section: "inbox-delivery", group: "Personal", label: "Inbox delivery", description: "How items that need you reach you outside Lane, in this workspace.", membersOnly: true, changersOnly: true, keywords: ["inbox", "notifications", "email", "alerts", "needs you", "off"] },
  { id: "account-security", section: "account-security", group: "Personal", label: "Security & access", description: "Manage sign-in methods and active sessions.", keywords: ["password", "sessions", "sign in"] },
  { id: "connections", section: "connections", group: "Personal", label: "Personal integrations", description: "Connect external work tools to your personal Lane account. Sign-in connections are already managed in Profile.", soon: true, keywords: ["connected accounts", "slack", "calendar"] },
  { id: "sign-in-connections", section: "profile", group: "Personal", label: "Connected accounts", description: "Manage accounts used to sign in through Clerk.", target: "connected-accounts", keywords: ["google", "login"] },
  { id: "ai-data", section: "account-security", group: "Personal", label: "AI data use", description: "What Lane sends for the Request AI check.", target: "ai-data", keywords: ["privacy", "anthropic"] },
  { id: "leave-workspace", section: "workspace", group: "Workspace", label: "Leave workspace", description: "Review the Leave organization option in Clerk.", target: "workspace-management", membersOnly: true },
  { id: "request-labels", section: "request-labels", group: "Requests", label: "Labels", description: "Organize Requests with shared labels.", soon: true },
  { id: "intake-templates", section: "intake-templates", group: "Requests", label: "Intake templates", description: "Reusable starting points for a clear Request.", soon: true },
  { id: "project-labels", section: "project-labels", group: "Projects", label: "Labels", description: "Organize Projects with shared labels.", soon: true },
  { id: "project-templates", section: "project-templates", group: "Projects", label: "Templates", description: "Reusable starting points for Projects.", soon: true },
  { id: "workspace", section: "workspace", group: "Workspace", label: "Workspace details", description: "Your workspace and membership.", membersOnly: true },
  { id: "members", section: "members", group: "Workspace", label: "Members", description: "Manage workspace members and invitations.", membersOnly: true, changersOnly: true, keywords: ["invite", "teammates"] },
  { id: "metrics", section: "metrics", group: "Workspace", label: "Metrics", description: "What your workspace measures, and how each metric is counted.", membersOnly: true, href: "/settings/metrics", keywords: ["metrics library", "metric definitions", "units", "conversion rate", "adoption", "customer satisfaction"] },
  { id: "slack", section: "slack", group: "Workspace", label: "Slack", description: "Connect Slack so people here can choose Slack DM for items that need them.", adminOnly: true, keywords: ["slack", "slack dm", "direct message", "connect", "disconnect", "integrations", "inbox delivery"] },
  { id: "security", section: "security", group: "Workspace", label: "Security", description: "Additional workspace access policies.", soon: true, adminOnly: true },
  { id: "applications", section: "applications", group: "Workspace", label: "Applications", description: "Review applications connected to your workspace.", soon: true, adminOnly: true },
  { id: "billing", section: "billing", group: "Workspace", label: "Billing", description: "The Lane plan, paying by card, and the Free Requests left.", adminOnly: true, keywords: ["free requests", "plan", "pay", "payment", "subscription", "pricing", "invoices", "card", "checkout", "yearly", "monthly", "founding discount", "enterprise"] },
  { id: "usage", section: "usage", group: "Workspace", label: "Usage & limits", description: "Workspace-level capacity and limits.", soon: true, adminOnly: true },
  { id: "import-export", section: "import-export", group: "Workspace", label: "Import & export", description: "Bring your data into Lane or take a copy with you.", soon: true, adminOnly: true },
  { id: "integrations", section: "integrations", group: "Integrations", label: "Integrations", description: "Workspace integrations are not available yet. No external tools are connected here.", soon: true, membersOnly: true },
  { id: "api", section: "api", group: "Connections", label: "API", description: "Developer access for future Lane integrations.", soon: true, adminOnly: true },
];

export function availableSettings(role: string) {
  return settingsCatalog.filter(entry => (!entry.adminOnly || role === "admin") && (!entry.membersOnly || role !== "guest") && (!entry.changersOnly || role === "admin" || role === "member"));
}

/** Arc SettingsCommand's word matching and ranking, with Lane availability ordering. */
export function searchSettings(entries: SettingsEntry[], query: string): Result[] {
  const q = query.trim().toLowerCase();
  if (!q) return entries.filter(e => ["profile", "theme", "role", "members"].includes(e.id)).map(def => ({ def, score: 0, match: null }));
  const words = q.split(/\s+/);
  return entries.flatMap(def => {
    const label = def.label.toLowerCase();
    const haystack = [label, def.group.toLowerCase(), def.description.toLowerCase(), ...(def.keywords ?? [])].join(" ");
    if (!words.every(word => haystack.includes(word))) return [];
    const score = (label.startsWith(q) ? 8 : label.includes(q) ? 5 : 0) + words.reduce((sum, word) => sum + (label.includes(word) ? 3 : 1), 0);
    const at = label.indexOf(q);
    return [{ def, score, match: at < 0 ? null : [at, at + q.length] as [number, number] }];
  }).sort((a, b) => Number(!!a.def.soon) - Number(!!b.def.soon) || b.score - a.score).slice(0, 8);
}

export const futurePreferences = [
  ["Display names", "Choose how names appear in Lane."],
  ["Send comments on", "Choose Enter or Command / Control + Enter."],
  ["First day of the week", "Set the week start for date pickers."],
  ["App sidebar", "Customize navigation visibility and ordering."],
  ["Text size", "Adjust text size across the app."],
  ["Underline links", "Make links easier to distinguish in content."],
  ["Interface motion", "Set a personal motion preference. Lane already respects reduced motion on your device."],
] as const;

export function settingsEntries(role: string): SettingsEntry[] {
  const planned: SettingsEntry[] = [
    ...futurePreferences.map(([label, description], i) => ({ id: `preference-${i}`, section: "preferences", group: "Preferences", label, description, soon: true })),
    ...[
      ["title", "Title", "Add your job title to your profile."],
      ["username", "Username", "Choose a short name for your profile."],
      ["additional-security", "Additional account security", "More security controls within Lane."],
    ].map(([id, label, description]) => ({ id, section: "profile", group: "Personal", label, description, soon: true })),
    ...(role === "guest" ? [] : [
      { id: "fiscal-year", section: "workspace", group: "Workspace", label: "Fiscal year", description: "Configure the reporting period for quarter and year outcomes.", soon: true },
      { id: "member-onboarding", section: "workspace", group: "Workspace", label: "Member onboarding", description: "A welcome message and starting points for teammates.", soon: true },
    ]),
  ];
  return [...availableSettings(role), ...planned].map(entry => entry.soon ? { ...entry, section: "coming-soon", target: `future-${entry.id}` } : entry);
}

export function settingsNavigation(role: string): SettingsEntry[] {
  return [...availableSettings(role).filter(entry => !entry.soon && entry.id === entry.section),
    { id: "coming-soon", section: "coming-soon", group: "More", label: "Coming soon", description: "Planned settings, together in one place. These options aren’t available yet." }];
}

/** Where a Settings section opens from outside Settings: its own page, or Profile's page with the section. */
export function settingsHref(id: string): string {
  return settingsCatalog.find(entry => entry.id === id)?.href ?? `/settings/profile?section=${id}`;
}

/**
 * Whether a section at `href` can show in place on the Settings page at `pathname`. Every Settings page
 * carries the Profile-page sections; a section with its own page shows in place only on that page.
 */
export function showsSettingsInPlace(href: string, pathname: string): boolean {
  if (!pathname.startsWith("/settings/")) return false;
  const path = href.split("?")[0];
  return path === "/settings/profile" || path === pathname;
}

/** The section whose own page (or a page under it, like one Metric definition's) is at `pathname`; null for any other path. */
export function settingsSectionAt(pathname: string): string | null {
  return settingsCatalog.find(entry => entry.href && (pathname === entry.href || pathname.startsWith(`${entry.href}/`)))?.id ?? null;
}

/** The event the Settings frame follows, besides popstate, to show the section in the URL. */
export const SETTINGS_SECTION_EVENT = "lane-settings-navigation"

/**
 * Shows a Settings section in place, as the frame's own sidebar and search do and as the ⌘K palette does
 * when already on Settings: the URL takes the section (a history entry, so Back returns) and the frame follows.
 */
export function showSettingsSection(id: string) {
  const url = new URL(window.location.href)
  url.searchParams.set("section", id)
  url.hash = ""
  window.history.pushState(null, "", url)
  window.dispatchEvent(new Event(SETTINGS_SECTION_EVENT))
}
