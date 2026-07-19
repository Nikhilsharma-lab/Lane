"use client";

import { useTheme } from "next-themes";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const THEME_CHOICES = ["system", "light", "dark"] as const;
type ThemeChoice = (typeof THEME_CHOICES)[number];

function isThemeChoice(
  value: string | null | undefined
): value is ThemeChoice {
  return THEME_CHOICES.some((choice) => choice === value);
}

export function ThemePreference() {
  const { theme, setTheme } = useTheme();
  const value = isThemeChoice(theme) ? theme : "system";

  return (
    <div className="space-y-2">
      <Label htmlFor="theme-preference">Theme</Label>
      <Select
        value={value}
        onValueChange={(nextTheme) => {
          if (isThemeChoice(nextTheme)) setTheme(nextTheme);
        }}
      >
        <SelectTrigger
          id="theme-preference"
          className="w-full sm:w-72"
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent align="start">
          <SelectItem value="system">System</SelectItem>
          <SelectItem value="light">Light</SelectItem>
          <SelectItem value="dark">Dark</SelectItem>
        </SelectContent>
      </Select>
      <p className="text-type-support text-muted-foreground">
        Follow your device setting or choose a theme for this browser.
      </p>
    </div>
  );
}
