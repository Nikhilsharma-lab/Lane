"use client";
import dynamic from "next/dynamic";
import { useState } from "react";
import { Button } from "@/components/arc/button/button";
import { Dialog, DialogContent, DialogTrigger } from "@/components/arc/dialog/dialog";
import { Skeleton } from "@/components/arc/skeleton/skeleton";
import type { RequestDetail } from "@/components/requests/detail-view";
const EditRequestForm = dynamic(() => import("./edit-request-form"), { loading: () => <Skeleton label="Loading Request editor" lines={5}/> });
export function EditRequest({ request, orgId }: {
    request: RequestDetail;
    orgId: string;
}) {
    const [open, setOpen] = useState(false);
    const [busy, setBusy] = useState(false);
    const [saved, setSaved] = useState(false);
    return <div>
    <Dialog open={open} onOpenChange={next => { if (!busy) {
        setOpen(next);
        if (next)
            setSaved(false);
    } }}>
      <DialogTrigger asChild><Button variant="secondary" size="sm">Edit Request</Button></DialogTrigger>
      <DialogContent title="Edit Request" description="Edit this Request while it is Open." layout="composer" onEscapeKeyDown={event => { if (busy)
        event.preventDefault(); }} onInteractOutside={event => event.preventDefault()}>
        <EditRequestForm request={request} orgId={orgId} onBusyChange={setBusy} onSaved={() => { setSaved(true); setOpen(false); }}/>
      </DialogContent>
    </Dialog>
    {saved && <span role="status">Changes saved</span>}
  </div>;
}
