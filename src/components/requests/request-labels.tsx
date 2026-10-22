"use client";
import type { ReactNode } from "react";
import { Badge } from "@/components/arc/badge/badge";
import { requestLabelKeys, type LabelColour } from "@/lib/request-labels";
import type { RequestType } from "@/lib/request-constants";
import { useWorkspaceLabels } from "./workspace-labels";
import styles from "./request-labels.module.css";
export function LabelDot({colour}:{colour:LabelColour}) { return <span className={styles.dot} data-colour={colour} aria-hidden="true"/>; }
export function useRequestLabels(request:{labelKeys?:string[]|null;requestType?:RequestType|null}) {
 const {labels}=useWorkspaceLabels();
 return requestLabelKeys(request).map(id=>labels.find(label=>label.id===id) ?? {id,name:"Saved label",colour:"grey" as const});
}
export function LabelBadge({ children, icon, className }: { children: ReactNode; icon?: ReactNode; className?: string }) {
 return <Badge data-label-tag="" size="sm" tone="neutral" icon={icon} className={[styles.badge, className].filter(Boolean).join(" ")}><span className={styles.name}>{children}</span></Badge>;
}
export function RequestLabels({request, compact = false}:{request:{labelKeys?:string[]|null;requestType?:RequestType|null}; compact?: boolean}) {
 const labels=useRequestLabels(request);
 return <span className={compact ? styles.compactLabels : styles.labels}>{labels.length ? (compact ? labels.slice(0,1) : labels).map(label=><LabelBadge key={label.id} icon={<LabelDot colour={label.colour}/>}>{label.name}</LabelBadge>) : <LabelBadge>No labels</LabelBadge>}{compact && labels.length > 1 && <LabelBadge className={styles.count}>+{labels.length - 1}</LabelBadge>}</span>;
}
