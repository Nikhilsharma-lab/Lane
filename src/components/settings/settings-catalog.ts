/* Search ranking adapted from licensed Arc Pro Settings Command, for Lane only. */
import type { SettingDefinition, Result } from "@/components/arc/blocks/settings-command/settings-command";
import { canChangeThings, laneRole, managesWorkspace, ROLE_NAMES, WORKSPACE_ROLES } from "@/lib/role-rules";

/** `href` marks a section with a page of its own (it loads its own data); every other section shows on Profile's page. */
/** `membersOnly` hides a section from Guests; `changersOnly` also from Viewers (#210), who manage no people and get no Needs-you items. */
/** `nonAdminDescription` is what anyone but an Admin reads instead, where the Admin's words promise what only an Admin can do (#287). */
/** `whenBillingEnforced` is what search reads once billing is enforced: words for what the pilot hides, and the keywords they add. */
export type SettingsEntry = SettingDefinition & { adminOnly?: boolean; membersOnly?: boolean; changersOnly?: boolean; href?: string; nonAdminDescription?: string; whenBillingEnforced?: { description: string; keywords: string[] } };
/** The server's switches the catalog follows, passed down like the role; the catalog reads no environment itself. */
export type SettingsSwitches = { billingEnforced?: boolean };
export const settingsCatalog: SettingsEntry[] = [
  { id: "profile", section: "profile", group: "Personal", label: "Profile", description: "Your account, how you sign in, your devices and your role.", keywords: ["account", "name", "email"] },
  { id: "role", section: "profile", group: "Personal", label: "Role", description: "Your PM, Designer, or Developer label.", target: "role", keywords: ["designer", "developer", "pm"] },
  { id: "preferences", section: "preferences", group: "Personal", label: "Preferences", description: "Make Lane feel right for you." },
  { id: "theme", section: "preferences", group: "Personal", label: "Theme", description: "System, Light, or Dark for this browser.", target: "theme", keywords: ["appearance", "dark mode", "light mode"] },
  { id: "inbox-delivery", section: "inbox-delivery", group: "Personal", label: "Inbox delivery", description: "How items that need you reach you outside Lane, in this workspace.", membersOnly: true, changersOnly: true, keywords: ["inbox", "notifications", "email", "alerts", "needs you", "off"] },
  { id: "account-security", section: "account-security", group: "Personal", label: "Security & access", description: "What Lane sends for the Request AI check. Your password and devices are in Profile." },
  { id: "connections", section: "connections", group: "Personal", label: "Personal integrations", description: "Connect external work tools to your personal Lane account. Sign-in connections are already managed in Profile.", soon: true, keywords: ["connected accounts", "slack", "calendar"] },
  // #394: the account's rows in Profile, each found by its own words; "Google" lands on the Google row (D32).
  { id: "account-name", section: "profile", group: "Personal", label: "Name", description: "The name shown on your Requests and comments.", target: "account-name", keywords: ["account", "rename"] },
  { id: "account-email", section: "profile", group: "Personal", label: "Email", description: "The email your account uses.", target: "account-email", keywords: ["account", "address"] },
  { id: "account-google", section: "profile", group: "Personal", label: "Google", description: "Connect or disconnect the Google account you sign in with.", target: "account-google", keywords: ["connected accounts", "login", "sign in"] },
  { id: "account-password", section: "profile", group: "Personal", label: "Password", description: "Change your password, or set one.", target: "account-password", keywords: ["account", "login", "sign in", "security"] },
  { id: "signed-in-devices", section: "profile", group: "Personal", label: "Signed-in devices", description: "Where you’re signed in, and signing out.", target: "devices-heading", keywords: ["sessions", "security", "sign out", "log out"] },
  { id: "ai-data", section: "account-security", group: "Personal", label: "AI data use", description: "What Lane sends for the Request AI check.", target: "ai-data", keywords: ["privacy", "anthropic"] },
  { id: "leave-workspace", section: "workspace", group: "Workspace", label: "Leave workspace", description: "Give up your access to this workspace.", target: "leave-workspace" },
  { id: "intake-templates", section: "intake-templates", group: "Requests", label: "Intake templates", description: "Reusable starting points for a clear Request.", soon: true },
  { id: "project-labels", section: "project-labels", group: "Projects", label: "Labels", description: "Organize Projects with shared labels.", soon: true },
  { id: "project-templates", section: "project-templates", group: "Projects", label: "Templates", description: "Reusable starting points for Projects.", soon: true },
  { id: "workspace", section: "workspace", group: "Workspace", label: "Workspace details", description: "Your workspace and membership." },
  { id: "members", section: "members", group: "Workspace", label: "Members", description: "Manage workspace members and invitations.", nonAdminDescription: "People in this workspace and their roles.", membersOnly: true, changersOnly: true, keywords: ["invite", "teammates"] },
  { id: "metrics", section: "metrics", group: "Workspace", label: "Metrics", description: "What your workspace measures, and how each metric is counted.", membersOnly: true, href: "/settings/metrics", keywords: ["metrics library", "metric definitions", "units", "conversion rate", "adoption", "customer satisfaction"] },
  { id: "slack", section: "slack", group: "Workspace", label: "Slack", description: "Connect Slack so people here can choose Slack DM for items that need them.", adminOnly: true, keywords: ["slack", "slack dm", "direct message", "connect", "disconnect", "integrations", "inbox delivery"] },
  { id: "security", section: "security", group: "Workspace", label: "Security", description: "Additional workspace access policies.", soon: true, adminOnly: true },
  { id: "applications", section: "applications", group: "Workspace", label: "Applications", description: "Review applications connected to your workspace.", soon: true, adminOnly: true },
  // #287: in the pilot, Billing shows the plan and Free Requests only, so search doesn't promise seats, bills or paying.
  { id: "billing", section: "billing", group: "Workspace", label: "Billing", description: "The Lane plan and the Free Requests left.", adminOnly: true, keywords: ["free requests", "plan", "subscription", "pricing", "card", "yearly", "monthly", "founding discount", "enterprise"],
    whenBillingEnforced: { description: "The Lane plan, seats, next bill, invoices and the Free Requests left.", keywords: ["pay", "payment", "invoices", "checkout", "seats", "next bill", "billing period", "update card", "cancel", "lapsed"] } },
  { id: "usage", section: "usage", group: "Workspace", label: "Usage & limits", description: "Workspace-level capacity and limits.", soon: true, adminOnly: true },
  { id: "import-export", section: "import-export", group: "Workspace", label: "Import & export", description: "Bring your data into Lane or take a copy with you.", soon: true, adminOnly: true },
  { id: "integrations", section: "integrations", group: "Integrations", label: "Integrations", description: "Workspace integrations are not available yet. No external tools are connected here.", soon: true, membersOnly: true },
  { id: "api", section: "api", group: "Connections", label: "API", description: "Developer access for future Lane integrations.", soon: true, adminOnly: true },
];

export function availableSettings(role: string, { billingEnforced = false }: SettingsSwitches = {}): SettingsEntry[] {
  const known = laneRole(role);
  const admin = !!known && managesWorkspace(known);
  return settingsCatalog.filter(entry => (!entry.adminOnly || admin) && (!entry.membersOnly || role !== "guest") && (!entry.changersOnly || (!!known && canChangeThings(known))))
    .map(entry => !admin && entry.nonAdminDescription ? { ...entry, description: entry.nonAdminDescription } : entry)
    .map(({ whenBillingEnforced, ...entry }) => billingEnforced && whenBillingEnforced
      ? { ...entry, description: whenBillingEnforced.description, keywords: [...(entry.keywords ?? []), ...whenBillingEnforced.keywords] } : entry);
}

/**
 * #288 (D30): the quiet line when the section someone asked for (from the address or a shared link) exists but their
 * role can't open it, e.g. "Billing is for Admins of this workspace." Who it is for comes from the catalog's own
 * availability rules. Null when the section opens, isn't a real section, or is only planned.
 */
export function sectionNotForRole(section: string | null | undefined, role: string): string | null {
  const entry = settingsCatalog.find(item => item.id === section && item.section === section && !item.soon);
  if (!entry || availableSettings(role).some(item => item.id === entry.id)) return null;
  const who = WORKSPACE_ROLES.filter(each => availableSettings(each).some(item => item.id === entry.id)).map(each => `${ROLE_NAMES[each]}s`);
  if (!who.length) return null;
  return `${entry.label} is for ${who.length > 1 ? `${who.slice(0, -1).join(", ")} and ${who.at(-1)}` : who[0]} of this workspace.`;
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
  ["Send comments on", "Choose Enter or Command / Control + Enter."],
  ["First day of the week", "Set the week start for date pickers."],
  ["App sidebar", "Customize navigation visibility and ordering."],
  ["Text size", "Adjust text size across the app."],
  ["Underline links", "Make links easier to distinguish in content."],
  ["Interface motion", "Set a personal motion preference. Lane already respects reduced motion on your device."],
] as const;

export function settingsEntries(role: string, switches: SettingsSwitches = {}): SettingsEntry[] {
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
  return [...availableSettings(role, switches), ...planned].map(entry => entry.soon ? { ...entry, section: "coming-soon", target: `future-${entry.id}` } : entry);
}

/** The sections in the sidebar, each with the purpose line its heading shows (Billing's follows `billingEnforced`). */
export function settingsNavigation(role: string, switches: SettingsSwitches = {}): SettingsEntry[] {
  return [...availableSettings(role, switches).filter(entry => !entry.soon && entry.id === entry.section),
    { id: "coming-soon", section: "coming-soon", group: "More", label: "Coming soon", description: "Planned settings, together in one place. These options aren’t available yet." }];
}

/** Where a Settings section opens from outside Settings: its own page, or Profile's page with the section. */
export function settingsHref(id: string): string {
  return settingsCatalog.find(entry => entry.id === id)?.href ?? `/settings/profile?section=${id}`;
}

export { showsSettingsInPlace } from "./settings-in-place";

/** The section whose own page (or a page under it, like one Metric definition's) is at `pathname`; null for any other path. */
export function settingsSectionAt(pathname: string): string | null {
  return settingsCatalog.find(entry => entry.href && (pathname === entry.href || pathname.startsWith(`${entry.href}/`)))?.id ?? null;
}

/** The event the Settings frame follows, besides popstate, to show the section in the URL. */
export const SETTINGS_SECTION_EVENT = "lane-settings-navigation"

/**
 * Shows a Settings section in place, as the frame's own sidebar and search do and as the ⌘K palette does
 * when already on Settings: the URL takes the section (a history entry, so Back returns) and the frame follows.
 * `target` is a place in it, which the URL's fragment then names.
 */
export function showSettingsSection(id: string, target = "") {
  const url = new URL(window.location.href)
  url.searchParams.set("section", id)
  url.hash = target
  window.history.pushState(null, "", url)
  window.dispatchEvent(new Event(SETTINGS_SECTION_EVENT))
}
