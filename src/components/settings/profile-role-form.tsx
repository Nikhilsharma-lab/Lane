"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/arc/button/button";
import { RadioGroup } from "@/components/arc/radio-group/radio-group";
import { Alert } from "@/components/arc/alert/alert";
import styles from "./profile.module.css";

export type ProductRole = "pm" | "designer" | "developer";

export function ProfileRoleForm({
  initialRole,
  onSave,
}: {
  initialRole: ProductRole;
  onSave: (role: ProductRole) => Promise<{ error?: string; success?: boolean }>;
}) {
  const [role, setRole] = useState<ProductRole>(initialRole);
  const [savedRole, setSavedRole] = useState<ProductRole>(initialRole);
  const [feedback, setFeedback] = useState<{
    kind: "error" | "success";
    message: string;
  } | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isPending || role === savedRole) return;
    setFeedback(null);
    startTransition(async () => {
      try {
        const result = await onSave(role);
        if (result.error) {
          setFeedback({ kind: "error", message: result.error });
          return;
        }
        setSavedRole(role);
        setFeedback({ kind: "success", message: "Role updated." });
      } catch {
        setFeedback({ kind: "error", message: "Your role could not be saved. Try again." });
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className={styles.form}>
      <fieldset disabled={isPending} className={styles.disabled}>
        <RadioGroup label="Role"
          value={role}
          onValueChange={(value) => {
            if (value === "pm" || value === "designer" || value === "developer") {
              setRole(value);
              setFeedback(null);
            }
          }}
          options={[
            { value: "pm", label: "PM" },
            { value: "designer", label: "Designer" },
            { value: "developer", label: "Developer" },
          ]}
        />
      </fieldset>
        <p className={styles.description}>
          This is a profile label only. It does not change what you can see or do.
        </p>
      <div className={styles.actions}>
        <Button
          type="submit"
          loading={isPending}
          disabled={isPending || role === savedRole}
          aria-label={isPending ? "Saving role…" : undefined}
        >
          {isPending ? "Saving role…" : "Save role"}
        </Button>
        {feedback && (
          <Alert
            role={feedback.kind === "error" ? "alert" : "status"}
            tone={feedback.kind === "error" ? "danger" : "success"}
            title={feedback.message}
          />
        )}
      </div>
    </form>
  );
}
