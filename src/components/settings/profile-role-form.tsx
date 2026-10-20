"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Button } from "@/components/arc/button/button";
import { Select } from "@/components/arc/select/select";
import { ChevronDown } from "lucide-react";
import settingsStyles from "./settings.module.css";
import { RadioGroup } from "@/components/arc/radio-group/radio-group";
import { useToastStack } from "@/components/arc/toast-stack/toast-stack";
import { Alert } from "@/components/arc/alert/alert";
import { useOptimisticAction } from "@/components/requests/use-optimistic-action";
import styles from "./profile.module.css";

export type ProductRole = "pm" | "designer" | "developer";
type SaveRole = (role: ProductRole) => Promise<{ error?: string; success?: boolean }>;

const options = [{ value: "pm", label: "PM" }, { value: "designer", label: "Designer" }, { value: "developer", label: "Developer" }];
const isRole = (value: string): value is ProductRole => value === "pm" || value === "designer" || value === "developer";
const roleLabel = (role: ProductRole) => options.find(option => option.value === role)?.label ?? role;

export function ProfileRoleForm({
  initialRole,
  onSave,
  autoSave = false,
  compact = false,
}: {
  initialRole: ProductRole;
  autoSave?: boolean;
  compact?: boolean;
  onSave: SaveRole;
}) {
  if (autoSave) return <AutoSavedRole initialRole={initialRole} onSave={onSave} compact={compact} />;
  return <ExplicitRoleForm initialRole={initialRole} onSave={onSave} compact={compact} />;
}

/** One queue for every role save on the pending-mutation overlay; no Request uses this id. */
const SAVE_ID = "profile-role";

/**
 * Plan item 2.9: the role saves on change, optimistically. The control and a
 * toast show the new role in the same frame, as Mark Done does; saves run one
 * at a time in the order chosen, and a choice overtaken while it waited is
 * never sent. A failure puts back the last role the server confirmed and turns
 * that choice's toast into the reason. Once nothing is in flight, a role the
 * server sends (a refresh after a lost response, another tab) is adopted.
 */
function AutoSavedRole({ initialRole, onSave, compact }: { initialRole: ProductRole; onSave: SaveRole; compact: boolean }) {
  const { toast, dismiss } = useToastStack();
  const optimistic = useOptimisticAction();
  const [role, setRole] = useState<ProductRole>(initialRole);
  const confirmed = useRef<ProductRole>(initialRole);
  const latest = useRef<ProductRole>(initialRole);
  const inFlight = useRef(0);
  const lastToast = useRef<string | null>(null);
  const toastCount = useRef(0);

  useEffect(() => {
    if (inFlight.current > 0 || initialRole === latest.current) return;
    confirmed.current = initialRole;
    latest.current = initialRole;
    setRole(initialRole);
  }, [initialRole]);

  function choose(next: ProductRole) {
    if (next === latest.current) return;
    latest.current = next;
    setRole(next);
    // A fresh id per choice: a toast still leaving the screen is never brought back by a later one.
    if (lastToast.current) dismiss(lastToast.current);
    const toastId = `profile-role-${++toastCount.current}`;
    lastToast.current = toastId;
    toast({ id: toastId, type: "success", title: "Role changed", description: `Your profile label is now ${roleLabel(next)}.` });
    // A later choice owns the screen; it goes back itself if it fails or is skipped.
    const revert = () => {
      if (latest.current !== next) return;
      latest.current = confirmed.current;
      setRole(confirmed.current);
    };
    let sent = false;
    inFlight.current++;
    void optimistic({
      id: SAVE_ID,
      waitForPending: true,
      run: async () => {
        if (latest.current !== next) return { success: true };
        sent = true;
        return onSave(next);
      },
      onError: (message) => {
        revert();
        toast({ id: toastId, type: "error", title: "Could not save your role", description: message });
      },
    }).then((outcome) => {
      if (outcome.status === "success" && sent) confirmed.current = next;
      else if (outcome.status === "skipped") revert();
    }).finally(() => { inFlight.current--; });
  }

  const changeRole = (value: string) => { if (isRole(value)) choose(value); };
  if (!compact) return <div className={styles.form}>
    <RadioGroup label="Role" value={role} onValueChange={changeRole} options={options} />
    <p className={styles.description}>This is a profile label only. It does not change what you can see or do.</p>
  </div>;
  return <div className={settingsStyles.card}>
    <div className={settingsStyles.cardBody}>
      <h3>Role</h3><p>Your discipline in the team. This doesn’t change your permissions.</p>
      <Select label="Role" value={role} onValueChange={changeRole} options={options}
        trigger={<Button type="button" variant="secondary" size="sm">{roleLabel(role)}<ChevronDown aria-hidden="true" /></Button>} />
    </div>
    <div className={settingsStyles.cardFooter}><span>Your role is saved automatically.</span></div>
  </div>;
}

function ExplicitRoleForm({ initialRole, onSave, compact }: { initialRole: ProductRole; onSave: SaveRole; compact: boolean }) {
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

  const changeRole = (value: string) => {
    if (saving.current) return;
    if (isRole(value)) { setRole(value); setFeedback(null); }
  };

  return (
    <form onSubmit={handleSubmit} className={compact ? settingsStyles.card : styles.form}>
      {compact ? <div className={settingsStyles.cardBody}>
        <h3>Role</h3><p>Your discipline in the team. This doesn’t change your permissions.</p>
        <Select label="Role" value={role} onValueChange={changeRole} options={options} disabled={isPending}
          trigger={<Button type="button" variant="secondary" size="sm" disabled={isPending}>{roleLabel(role)}<ChevronDown aria-hidden="true" /></Button>} />
      </div> : <>
        <fieldset disabled={isPending} className={styles.disabled}>
          <RadioGroup label="Role" value={role} onValueChange={changeRole} options={options} />
        </fieldset>
        <p className={styles.description}>This is a profile label only. It does not change what you can see or do.</p>
      </>}
      <div className={compact ? settingsStyles.cardFooter : styles.actions}>
        {compact && !feedback && !isPending && <span>Save your role to update your profile.</span>}
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
            role="alert"
            tone="danger"
            title={feedback.message}
          />
        )}
      </div>
    </form>
  );
}
