"use client";

import type { RefObject } from "react";
import { Alert } from "@/components/arc/alert/alert";
import { Button } from "@/components/arc/button/button";
import { Dialog, DialogClose, DialogContent } from "@/components/popup/adaptive-dialog";
import styles from "./settings.module.css";

/** #207: "Disconnect Slack?" (slack-connection-card.tsx keeps its button and what it does). */
export function DisconnectSlackDialog({ open, onOpenChange, opener, error, busy, onDisconnect }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  opener: RefObject<HTMLElement | null>;
  error: string | null;
  busy: boolean;
  onDisconnect: () => void;
}) {
  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent title="Disconnect Slack?" description="People who chose Slack DM get email instead. They can choose Slack DM again once Slack is connected." returnFocus={() => opener.current}>
      {error && <Alert role="alert" tone="danger" title={error} />}
      <div className={styles.dialogActions}>
        <DialogClose asChild><Button variant="ghost" disabled={busy}>Cancel</Button></DialogClose>
        <Button variant="danger" onClick={onDisconnect} loading={busy}>Disconnect Slack</Button>
      </div>
    </DialogContent>
  </Dialog>;
}
