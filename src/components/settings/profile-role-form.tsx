"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { Alert } from "@/components/arc/alert/alert";
import { Button } from "@/components/arc/button/button";
import { Select } from "@/components/arc/select/select";
import { useOptimisticAction } from "@/components/requests/use-optimistic-action";
import { TRY_AGAIN } from "@/lib/failure-messages";
import { usePointerPickFocus } from "./pointer-pick-focus";
import { SettingsRow } from "./settings-group";
import styles from "./settings.module.css";

export type ProductRole = "pm" | "designer" | "developer";
type SaveRole = (role: ProductRole) => Promise<{ error?: string; success?: boolean }>;

const options = [{ value: "pm", label: "PM" }, { value: "designer", label: "Designer" }, { value: "developer", label: "Developer" }];
const isRole = (value: string): value is ProductRole => value === "pm" || value === "designer" || value === "developer";
const roleLabel = (role: ProductRole) => options.find(option => option.value === role)?.label ?? role;
const HINT = "Your discipline in the team. This doesn’t change your permissions.";

/** One queue for every role save on the pending-mutation overlay; no Request uses this id. */
const SAVE_ID = "profile-role";

/**
 * Plan item 2.9: Settings → Profile's Role row saves on change, optimistically. Saves run one at a time in the order
 * chosen, and a choice overtaken while it waited is never sent. A role the server sends (a refresh after a lost
 * response, another tab) is adopted once nothing is in flight; one that arrives during a save is adopted if that save
 * is then put back and no later save was confirmed after it arrived.
 *
 * #288 (D31, D3): the select showing the new role is the confirmation; there is no toast. A failure, offline included,
 * puts back the last role the server confirmed and says so on the row with Try again, which sends that choice again.
 * Nothing refreshes the page, so a lost connection never falls back to the browser's own error page. (D35) A pick with
 * the pointer leaves no keyboard ring on the select.
 */
export function ProfileRoleForm({ initialRole, onSave }: { initialRole: ProductRole; onSave: SaveRole }) {
  const optimistic = useOptimisticAction();
  const [role, setRole] = useState<ProductRole>(initialRole);
  const [failed, setFailed] = useState<{ role: ProductRole; message: string } | null>(null);
  const confirmed = useRef<ProductRole>(initialRole);
  const latest = useRef<ProductRole>(initialRole);
  const inFlight = useRef(0);
  const confirmations = useRef(0);
  const reverted = useRef(false);
  // The role the server sent while a save was in flight, and how many saves had been confirmed then.
  const postponed = useRef<{ role: ProductRole; at: number } | null>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const pick = usePointerPickFocus(trigger);

  useEffect(() => {
    if (inFlight.current > 0) { postponed.current = { role: initialRole, at: confirmations.current }; return; }
    if (initialRole === latest.current) return;
    confirmed.current = initialRole;
    latest.current = initialRole;
    setRole(initialRole);
  }, [initialRole]);

  function settle() {
    if (--inFlight.current > 0) return;
    const server = postponed.current;
    postponed.current = null;
    const adopt = reverted.current && server && server.at === confirmations.current && server.role !== latest.current;
    reverted.current = false;
    if (!adopt) return;
    confirmed.current = server.role;
    latest.current = server.role;
    setRole(server.role);
  }

  function choose(next: ProductRole) {
    if (next === latest.current) return;
    latest.current = next;
    setRole(next);
    setFailed(null);
    // A later choice owns the screen; it goes back itself if it fails or is skipped.
    const revert = () => {
      if (latest.current !== next) return;
      latest.current = confirmed.current;
      reverted.current = true;
      setRole(confirmed.current);
    };
    let sent = false;
    inFlight.current++;
    void optimistic({
      id: SAVE_ID,
      waitForPending: true,
      // The select going back is the whole answer; a refresh offline would leave Lane for the browser's error page.
      refreshOnError: false,
      run: async () => {
        if (latest.current !== next) return { success: true };
        sent = true;
        return onSave(next);
      },
      onError: message => {
        if (latest.current !== next) return;
        revert();
        setFailed({ role: next, message });
      },
    }).then(outcome => {
      if (outcome.status === "success" && sent) { confirmed.current = next; confirmations.current++; }
      else if (outcome.status === "skipped") revert();
    }).finally(settle);
  }

  // #287: a row of Profile's group; the row is the "role" search target.
  return <SettingsRow id="role" label="Role" hint={HINT}
    control={<Select label="Role" value={role} options={options} onContentKeyDown={pick.keyboard}
      onValueChange={value => { pick.settle(); if (isRole(value)) choose(value); }}
      trigger={<Button ref={trigger} type="button" variant="secondary" size="sm">{roleLabel(role)}<ChevronDown aria-hidden="true" /></Button>} />}>
    {failed && <div className={styles.rowFailure}>
      <Alert role="alert" tone="danger" title={`Couldn’t save ${roleLabel(failed.role)} as your role`}>{failed.message}</Alert>
      <Button variant="secondary" size="sm" onClick={() => { choose(failed.role); trigger.current?.focus({ preventScroll: true }); }}>{TRY_AGAIN}</Button>
    </div>}
  </SettingsRow>;
}
