"use client";

import { RadioGroup } from "@/components/arc/radio-group/radio-group";
import styles from "./auth.module.css";

export type FunctionalRole = "pm" | "designer" | "developer";
const roles = [
  { value: "pm", label: "PM" },
  { value: "designer", label: "Designer" },
  { value: "developer", label: "Developer" },
];

export function RoleSelection({ value, onValueChange, disabled = false, invalid = false }: {
  value: FunctionalRole | null; onValueChange: (value: FunctionalRole) => void; disabled?: boolean; invalid?: boolean;
}) {
  return <fieldset className={styles.disabled} disabled={disabled} aria-invalid={invalid || undefined}>
    <RadioGroup label="Your role" name="functionalRole" options={roles} value={value ?? ""}
      onValueChange={(next) => { if (!disabled && (next === "pm" || next === "designer" || next === "developer")) onValueChange(next); }} />
  </fieldset>;
}
