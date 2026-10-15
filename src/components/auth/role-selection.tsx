"use client";

import { RadioGroup } from "@/components/arc/radio-group/radio-group";
import styles from "./auth.module.css";

export type FunctionalRole = "pm" | "designer" | "developer";

/** Plan item 2.2: each role has a number key, in the order the rows are shown. */
export const ROLE_OPTIONS: readonly { value: FunctionalRole; label: string; shortcut: "1" | "2" | "3" }[] = [
  { value: "pm", label: "PM", shortcut: "1" },
  { value: "designer", label: "Designer", shortcut: "2" },
  { value: "developer", label: "Developer", shortcut: "3" },
];

/** The role a key picks, matched on `KeyboardEvent.key` so the numpad and Shift-digit layouts (AZERTY) work too. */
export function roleForKey(key: string): FunctionalRole | null {
  return ROLE_OPTIONS.find(option => option.shortcut === key)?.value ?? null;
}

export function RoleSelection({ value, onValueChange, disabled = false, invalid = false }: {
  value: FunctionalRole | null; onValueChange: (value: FunctionalRole) => void; disabled?: boolean; invalid?: boolean;
}) {
  return <fieldset className={styles.disabled} disabled={disabled} aria-invalid={invalid || undefined}>
    <RadioGroup label="Your role" name="functionalRole" options={[...ROLE_OPTIONS]} value={value ?? ""}
      onValueChange={(next) => { if (!disabled && (next === "pm" || next === "designer" || next === "developer")) onValueChange(next); }} />
  </fieldset>;
}
