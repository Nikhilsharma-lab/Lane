"use client";

import { useEffect, useEffectEvent, useRef, useState } from "react";
import { flushSync } from "react-dom";

import { AuthAction } from "@/components/auth/auth-action";
import { OnboardingChrome } from "@/components/auth/onboarding-chrome";
import { Alert } from "@/components/arc/alert/alert";
import { AuthFormCard } from "@/components/auth/auth-form-card";
import { RoleSelection, roleForKey, type FunctionalRole } from "@/components/auth/role-selection";
import styles from "@/components/auth/auth.module.css";
import { useRecoverableAction } from "@/hooks/use-recoverable-action";
import { saveOnboardingRole } from "./actions";

const TYPING_SELECTOR = 'textarea, select, [role="textbox"], [role="combobox"]';
const NON_TEXT_INPUTS = new Set(["radio", "checkbox", "button", "submit", "reset"]);

/** Number keys never steal a character from a field someone is typing in. */
function isTextEntry(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable || target.closest(TYPING_SELECTOR)) return true;
  return target instanceof HTMLInputElement && !NON_TEXT_INPUTS.has(target.type);
}

/** A saved role answers with a redirect to /: the call rejects with Next's
 * redirect error while the router is already rendering / from the response. */
function isRedirect(error: unknown) {
  return typeof error === "object" && error !== null && "digest" in error
    && typeof error.digest === "string" && error.digest.startsWith("NEXT_REDIRECT;");
}

export function RoleForm() {
  const formRef = useRef<HTMLFormElement>(null);
  const [role, setRole] = useState<FunctionalRole | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { pending, run } = useRecoverableAction();
  // useRecoverableAction clears `pending` as soon as the action answers; this
  // keeps the form disabled until the navigation to / commits.
  const [saved, setSaved] = useState(false);
  const busy = pending || saved;

  // Plan item 2.2: 1, 2 and 3 pick a role. Matched on `key`, so the numpad and
  // Shift-digit layouts (AZERTY) work; Shift is therefore not rejected. Moving
  // focus to the checked radio is the announcement ("Designer, radio button,
  // checked, 2 of 3"), so no live region is added.
  const onShortcut = useEffectEvent((event: KeyboardEvent) => {
    if (busy || event.defaultPrevented || event.repeat || event.isComposing || event.metaKey || event.ctrlKey || event.altKey || isTextEntry(event.target)) return;
    const next = roleForKey(event.key);
    if (!next) return;
    event.preventDefault();
    // Commit the checked state first, so focus lands on a radio that is already checked.
    flushSync(() => { setRole(next); setError(null); });
    formRef.current?.querySelector<HTMLInputElement>(`input[type="radio"][value="${next}"]`)?.focus();
  });
  useEffect(() => {
    const listener = (event: KeyboardEvent) => onShortcut(event);
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, []);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    if (!role) {
      setError("Choose a role to continue.");
      return;
    }

    setError(null);
    const outcome = await run(() => saveOnboardingRole({ role }));
    if (outcome.status === "blocked") return;
    // The one navigation: saveOnboardingRole revalidates and redirects to /, so
    // its response carries / and the router is already on its way there. No
    // router call here, no refresh, and no prefetch of / before the save.
    if (outcome.status === "failed" && isRedirect(outcome.error)) {
      setSaved(true);
      return;
    }
    if (outcome.status === "failed") {
      setError(
        "Your role selection is still here. Check your connection and try again."
      );
      return;
    }

    setError(outcome.value.error);
  }

  return (
    <OnboardingChrome>
      <AuthFormCard title="Choose your role" description="A label for your team, not a permission. Change it any time in Profile settings.">
        <form ref={formRef} onSubmit={submit} className="grid gap-6" noValidate>
          <RoleSelection value={role} disabled={busy} invalid={Boolean(error)} onValueChange={(value) => { setRole(value); setError(null); }} />
          {error && <Alert tone="danger" title={error} />}
          <AuthAction type="submit" loading={busy} loadingLabel="Saving role…">Continue</AuthAction>
          <p className={styles.shortcuts}><kbd>C</kbd> to create, <kbd>/</kbd> to search</p>
        </form>
      </AuthFormCard>
    </OnboardingChrome>
  );
}
