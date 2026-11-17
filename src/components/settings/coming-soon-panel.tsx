import { Badge } from "@/components/arc/badge/badge";
import type { SettingsEntry } from "./settings-catalog";
import { SettingsGroup, SettingsRow } from "./settings-group";

/**
 * Settings → Coming soon: planned settings, one row group per area. #287 (D24): each row carries a quiet
 * "Coming soon" tag, not a disabled button, so nothing looks like a control that's broken. Nothing here saves.
 */
export function FutureSettings({ entries }: { entries: SettingsEntry[] }) {
  const groups = [...new Set(entries.map(entry => entry.group))];
  return <>
    {groups.map(group => <SettingsGroup key={group} label={group} labelId={`future-group-${group.toLowerCase().replace(/\W+/g, "-")}`}>
      {entries.filter(entry => entry.group === group).map(entry => <SettingsRow key={entry.id} id={entry.target} label={entry.label} hint={entry.description}
        control={<Badge size="sm">Coming soon</Badge>} />)}
    </SettingsGroup>)}
  </>;
}
