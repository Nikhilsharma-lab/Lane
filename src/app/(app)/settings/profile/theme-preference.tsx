"use client";

import { useSyncExternalStore } from "react";
import { useTheme } from "next-themes";
import SegmentedControl from "@/components/arc/segmented-control/segmented-control";
import { SettingsRow } from "@/components/settings/settings-group";
import { RadioGroup } from "@/components/arc/radio-group/radio-group";
import styles from "@/components/settings/profile.module.css";

const THEME_CHOICES = ["system", "light", "dark"] as const;
type ThemeChoice = (typeof THEME_CHOICES)[number];
const subscribe = () => () => {};
function isThemeChoice(value: string | null | undefined): value is ThemeChoice {
  return THEME_CHOICES.some((choice) => choice === value);
}

export function ThemePreference({ compact = false }: { compact?: boolean }) {
  const { theme, setTheme } = useTheme();
  const mounted = useSyncExternalStore(subscribe, () => true, () => false);
  const value = mounted && isThemeChoice(theme) ? theme : "system";
  // #287: Preferences' Theme row (the "theme" search target), saved on this device as soon as it changes.
  if (compact) return <SettingsRow id="theme" label="Theme" hint="Choose a theme for this browser."
    control={<SegmentedControl label="Theme" value={value} onValueChange={next => { if (isThemeChoice(next)) setTheme(next); }}
      options={[{ value: "system", label: "System" }, { value: "light", label: "Light" }, { value: "dark", label: "Dark" }]} />} />;
  return <div className={styles.field}>
    <RadioGroup label="Theme" options={[{ value: "system", label: "System" }, { value: "light", label: "Light" }, { value: "dark", label: "Dark" }]}
      value={value} onValueChange={(next) => { if (isThemeChoice(next)) setTheme(next); }} />
    <p className={styles.description}>Follow your device setting or choose a theme for this browser.</p>
  </div>;
}
