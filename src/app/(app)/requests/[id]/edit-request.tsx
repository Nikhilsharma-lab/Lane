"use client";
import dynamic from "next/dynamic";
import { useState } from "react";
import { useToastStack } from "@/components/arc/toast-stack/toast-stack";
import { Button } from "@/components/arc/button/button";
import { Dialog, DialogContent, DialogTrigger } from "@/components/arc/dialog/dialog";
import { Skeleton } from "@/components/arc/skeleton/skeleton";
import type { RequestDetail } from "@/components/requests/detail-view";
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
      <DialogTrigger asChild><Button variant="secondary" size="sm">Edit Request</Button></DialogTrigger>
      <DialogContent title="Edit Request" description="Edit this Request while it is Open." layout="composer" onEscapeKeyDown={event => { if (busy)
        event.preventDefault(); }} onInteractOutside={event => event.preventDefault()}>
        <EditRequestForm request={request} orgId={orgId} draftOwnerId={draftOwnerId} onBusyChange={setBusy} onSaved={() => { setOpen(false); toast({ type: "success", title: "Changes saved" }); }}/>
      </DialogContent>
    </Dialog>
  </div>;
}
