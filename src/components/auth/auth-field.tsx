"use client";

import { useId, type ComponentProps, type ReactNode } from "react";
import { PasswordField } from "./password-field";
import { Input } from "@/components/arc/input/input";
import type { LucideIcon } from "lucide-react";
import styles from "./auth.module.css";

type AuthInputFieldProps = ComponentProps<typeof Input> & { trailing?: ReactNode; endIcon?: LucideIcon };
type AuthPasswordFieldProps = ComponentProps<typeof PasswordField> & { trailing?: ReactNode; error?: string };

export function AuthInputField({ error, description, trailing, endIcon: EndIcon, ...props }: AuthInputFieldProps) {
  return <div className={styles.field} data-auth-field="">
    <Input {...props} description={error ? undefined : description} error={error} />
    {(trailing || EndIcon) && <div className={styles.fieldExtra}>{EndIcon && <EndIcon aria-hidden="true" size={16} />}{trailing}</div>}
  </div>;
}

export function AuthPasswordField({ error, description, trailing, id: providedId, ...props }: AuthPasswordFieldProps) {
  const generatedId = useId();
  const id = providedId ?? generatedId;
  return <fieldset className={styles.field + " " + styles.disabled} disabled={props.disabled} data-auth-field="">
    <PasswordField {...props} id={id} description={error ? undefined : description} aria-invalid={Boolean(error) || undefined}
      aria-describedby={error ? id + "-error" : undefined} />
    {error && <p id={id + "-error"} role="alert" className={styles.error}>{error}</p>}
    {trailing && <div className={styles.fieldExtra}>{trailing}</div>}
  </fieldset>;
}
