"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Dialog, DialogContent } from "@/components/arc/dialog/dialog";
import { Button } from "@/components/arc/button/button";

/** Mounted only while creation is unresolved or a saved Request has unfinished files. */
export function IntakeNavigationGuard({
  creating,
  onLeave,
}: {
  creating: boolean;
  onLeave: () => void;
}) {
  const router = useRouter();
  const [destination, setDestination] = useState<string | null>(null);
  const navigationLink = useRef<HTMLAnchorElement | null>(null);
  const keepWorkingButton = useRef<HTMLButtonElement | null>(null);

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
      navigationLink.current = target;
      setDestination(`${next.pathname}${next.search}${next.hash}`);
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
        description={creating ? "Lane is still confirming that your Request was saved. Keep this page open until creation finishes." : "Your Request is saved. Unfinished files and their retry controls will be lost if you leave this page."}
        onOpenAutoFocus={(event) => { event.preventDefault(); keepWorkingButton.current?.focus(); }}
        onCloseAutoFocus={(event) => { event.preventDefault(); navigationLink.current?.focus(); }}
      >
        <div className="flex justify-end gap-2">
          <Button ref={keepWorkingButton} type="button" variant="secondary" onClick={() => setDestination(null)}>Keep working</Button>
          {!creating && <Button type="button" variant="danger" onClick={() => {
            if (!destination) return;
            onLeave(); setDestination(null); router.push(destination);
          }}>Leave page</Button>}
        </div>
      </DialogContent>
    </Dialog>
  );
}
