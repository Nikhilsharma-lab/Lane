"use client";
import dynamic from "next/dynamic";
import { useState } from "react";
import { Pencil } from "lucide-react";
import { useToastStack } from "@/components/arc/toast-stack/toast-stack";
import { Button } from "@/components/arc/button/button";
import { Dialog, DialogContent, DialogTrigger } from "@/components/arc/dialog/dialog";
import { Skeleton } from "@/components/arc/skeleton/skeleton";
import type { RequestDetail } from "@/components/requests/detail-view";
import styles from "@/components/requests/detail.module.css";
const EditRequestForm = dynamic(() => import("./edit-request-form"), { loading: () => <Skeleton label="Loading Request editor" lines={5}/> });
export function EditRequest({ request, orgId, draftOwnerId }: {
    request: RequestDetail;
    orgId: string;
    draftOwnerId: string;
}) {
    const [open, setOpen] = useState(false);
    const [busy, setBusy] = useState(false);
    const { toast } = useToastStack();
    return <div>
    <Dialog open={open} onOpenChange={next => { if (!busy) {
        setOpen(next);
    } }}>
      {/* At 640px and below the strip has room for an icon only; the name stays "Edit Request". */}
      <DialogTrigger asChild><Button variant="secondary" size="sm" morph="plain" className={styles.editTrigger} aria-label="Edit Request"><Pencil className={styles.editIcon} strokeWidth={1.75} aria-hidden="true" /><span className={styles.editLabel}>Edit Request</span></Button></DialogTrigger>
      <DialogContent title="Edit Request" description="Edit this Request while it is Open." layout="composer" onEscapeKeyDown={event => { if (busy)
        event.preventDefault(); }} onInteractOutside={event => event.preventDefault()}>
        <EditRequestForm request={request} orgId={orgId} draftOwnerId={draftOwnerId} onBusyChange={setBusy} onSaved={() => { setOpen(false); toast({ type: "success", title: "Changes saved" }); }}/>
      </DialogContent>
    </Dialog>
  </div>;
}
