"use client";

import { useRef, useState, useTransition } from "react";
import { Button } from "@/components/arc/button/button";
import { Select } from "@/components/arc/select/select";
import { ChevronDown } from "lucide-react";
import settingsStyles from "./settings.module.css";
import { RadioGroup } from "@/components/arc/radio-group/radio-group";
import { useToastStack } from "@/components/arc/toast-stack/toast-stack";
import { Alert } from "@/components/arc/alert/alert";
import styles from "./profile.module.css";

export type ProductRole = "pm" | "designer" | "developer";

export function ProfileRoleForm({
  initialRole,
  onSave,
  autoSave = false,
  compact = false,
}: {
  initialRole: ProductRole;
  autoSave?: boolean;
  compact?: boolean;
  onSave: (role: ProductRole) => Promise<{ error?: string; success?: boolean }>;
}) {
  const { toast } = useToastStack();
  const [role, setRole] = useState<ProductRole>(initialRole);
  const [savedRole, setSavedRole] = useState<ProductRole>(initialRole);
  const [feedback, setFeedback] = useState<{
    kind: "error";
    message: string;
  } | null>(null);
  const [isPending, startTransition] = useTransition();
  const saving = useRef(false);

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    saveRole(role);
  }

  function saveRole(next: ProductRole) {
    if (saving.current || next === savedRole) return;
    saving.current = true;
    setFeedback(null);
    startTransition(async () => {
      try {
        const result = await onSave(next);
        if (result.error || !result.success) {
          setFeedback({ kind: "error", message: result.error || "Your role could not be saved. Try again." });
          return;
        }
        setSavedRole(next);
        toast({ type: "success", title: "Role updated." });
      } catch {
        setFeedback({ kind: "error", message: "Your role could not be saved. Try again." });
      } finally {
        saving.current = false;
      }
    });
  }

  const options = [{ value: "pm", label: "PM" }, { value: "designer", label: "Designer" }, { value: "developer", label: "Developer" }];
  const changeRole = (value: string) => {
    if (saving.current) return;
    if (value === "pm" || value === "designer" || value === "developer") {
      setRole(value); setFeedback(null);
      if (autoSave) saveRole(value);
    }
  };

  return (
    <form onSubmit={handleSubmit} className={compact ? settingsStyles.card : styles.form}>
      {compact ? <div className={settingsStyles.cardBody}>
        <h3>Role</h3><p>Your discipline in the team. This doesn’t change your permissions.</p>
        <Select label="Role" value={role} onValueChange={changeRole} options={options} disabled={isPending}
          trigger={<Button type="button" variant="secondary" size="sm" disabled={isPending}>{options.find(option => option.value === role)?.label}<ChevronDown aria-hidden="true" /></Button>} />
      </div> : <>
        <fieldset disabled={isPending} className={styles.disabled}>
          <RadioGroup label="Role" value={role} onValueChange={changeRole} options={options} />
        </fieldset>
        <p className={styles.description}>This is a profile label only. It does not change what you can see or do.</p>
      </>}
      <div className={compact ? settingsStyles.cardFooter : styles.actions}>
        {compact && !feedback && !isPending && <span>{autoSave ? "Your role is saved automatically." : "Save your role to update your profile."}</span>}
        {(!autoSave || feedback?.kind === "error") && <Button
          type="submit"
          loading={isPending}
          disabled={isPending || role === savedRole}
          aria-label={isPending ? "Saving role…" : undefined}
        >
          {isPending ? "Saving role…" : autoSave ? "Retry" : "Save role"}
        </Button>}
        {autoSave && isPending && <p role="status" className={styles.description}>Saving role…</p>}
        {feedback && (
          <Alert
            role="alert"
            tone="danger"
            title={feedback.message}
          />
        )}
      </div>
    </form>
  );
}
