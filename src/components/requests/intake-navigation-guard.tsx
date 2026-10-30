"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Dialog, DialogContent } from "@/components/popup/adaptive-dialog";
import { Button } from "@/components/arc/button/button";

export type IntakeCloseAttempt = (exit: () => void) => void;
export type RegisterIntakeCloseAttempt = (attempt: IntakeCloseAttempt) => () => void;

/** Mounted only while creation is unresolved or a saved Request has unfinished files. */
export function IntakeNavigationGuard({
  creating,
  onLeave,
  registerCloseAttempt,
}: {
  creating: boolean;
  onLeave: () => void;
  registerCloseAttempt?: RegisterIntakeCloseAttempt;
}) {
  const router = useRouter();
  const [destination, setDestination] = useState<{ href: string } | { exit: () => void } | null>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const leaving = useRef(false);
  const keepWorkingButton = useRef<HTMLButtonElement | null>(null);

  useEffect(() => registerCloseAttempt?.(exit => {
    returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    leaving.current = false;
    setDestination({ exit });
  }), [registerCloseAttempt]);

  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    const beforeNavigate = (event: MouseEvent) => {
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      )
        return;
      const target =
        event.target instanceof Element
          ? event.target.closest<HTMLAnchorElement>("a[href]")
          : null;
      if (
        !target ||
        target.hasAttribute("download") ||
        (target.target && target.target !== "_self")
      )
        return;
      const next = new URL(target.href, window.location.href);
      if (next.origin !== window.location.origin) return;
      if (
        next.pathname === window.location.pathname &&
        next.search === window.location.search
      )
        return;
      event.preventDefault();
      event.stopImmediatePropagation();
      returnFocus.current = target;
      leaving.current = false;
      setDestination({ href: `${next.pathname}${next.search}${next.hash}` });
    };
    window.addEventListener("beforeunload", beforeUnload);
    document.addEventListener("click", beforeNavigate, true);
    return () => {
      window.removeEventListener("beforeunload", beforeUnload);
      document.removeEventListener("click", beforeNavigate, true);
    };
  }, []);

  return (
    <Dialog open={destination !== null} onOpenChange={(open) => { if (!open) setDestination(null); }}>
      <DialogContent
        title={creating ? "Creating your Request" : "Leave unfinished uploads?"}
        description={creating ? "Lane is still confirming that your Request was saved. Keep this page open until creation finishes." : "Your Request is saved. Files not yet uploaded won’t be added if you leave this page."}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            // The focused nested content can cancel immediately, including
            // while Radix is updating the highest dismissable layer.
            event.preventDefault(); event.stopPropagation(); setDestination(null);
          }
        }}
        onOpenAutoFocus={(event) => { event.preventDefault(); keepWorkingButton.current?.focus(); }}
        onCloseAutoFocus={(event) => { event.preventDefault(); if (!leaving.current) returnFocus.current?.focus(); }}
      >
        <div className="flex justify-end gap-2">
          <Button ref={keepWorkingButton} type="button" variant="secondary" onClick={() => setDestination(null)}>Keep working</Button>
          {!creating && <Button type="button" variant="danger" onClick={() => {
            if (!destination || leaving.current) return;
            leaving.current = true;
            onLeave(); setDestination(null);
            if ("exit" in destination) destination.exit();
            else router.push(destination.href);
          }}>Leave page</Button>}
        </div>
      </DialogContent>
    </Dialog>
  );
}
