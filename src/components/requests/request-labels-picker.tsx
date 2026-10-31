"use client";
import { callAction } from "@/lib/action-call";
import { thrownMessage } from "@/lib/failure-messages";
import { useEffect, useId, useRef, useState } from "react";
import { Building2, Folder, Plus, Tags } from "lucide-react";
import { useToastStack } from "@/components/arc/toast-stack/toast-stack";
import { Button } from "@/components/arc/button/button";
import { SearchField } from "@/components/arc/search-field/search-field";
import { Checkbox } from "@/components/arc/checkbox/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/arc/popover/popover";
import { createLabel } from "@/app/(app)/intake/label-actions";
import { LABEL_COLOURS, type LabelColour, type RequestLabel } from "@/lib/request-labels";
import { pickerPopoverProps } from "./request-property-pickers";
import { useWorkspaceLabels } from "./workspace-labels";
import { LabelDot } from "./request-labels";
import styles from "./request-labels.module.css";
import pickerStyles from "./request-property-pickers.module.css";
import { Placeholder } from "@/components/loading/placeholder";

function LabelSelection({chosen}:{chosen:RequestLabel[]}) {
 const icon = !chosen.length ? <Tags aria-hidden="true"/> : chosen.length > 1 ? <span className={styles.dotStack}>{chosen.slice(0,3).map(label=><LabelDot key={label.id} colour={label.colour}/>)}</span> : <LabelDot colour={chosen[0].colour}/>;
 return <span className={pickerStyles.chipContent}>{icon}<span className={pickerStyles.chipLabel}>{chosen.length > 1 ? `${chosen.length} labels` : chosen[0]?.name ?? "Labels"}</span></span>;
}

/** The composer's label picker. Its own module, so the list's labels never load the picker. */
export function RequestLabelsPicker({orgId,value,onChange,disabled,project}:{orgId:string;value:string[];onChange:(keys:string[])=>void;disabled?:boolean;project?:{id:string;name:string}|null}) {
 const {toast}=useToastStack();
 const catalogue=useWorkspaceLabels(),id=useId(),search=useRef<HTMLInputElement>(null),stepFocus=useRef<HTMLButtonElement>(null);
 const [open,setOpen]=useState(false),[query,setQuery]=useState(""),[step,setStep]=useState<"labels"|"scope"|"colour">("labels"),[scopeProjectId,setScopeProjectId]=useState<string|null>(null),[busy,setBusy]=useState(false),[creatingColour,setCreatingColour]=useState<LabelColour|null>(null),[error,setError]=useState<string|null>(null);
 useEffect(()=>{if(open){if(step==="labels")search.current?.focus();else stepFocus.current?.focus();}},[step,open]);
 const chosen=value.map(key=>catalogue.labels.find(label=>label.id===key)).filter((label):label is RequestLabel=>!!label);
 const normalized=query.trim().replace(/\s+/g," ");
 const shown=catalogue.labels.filter(label=>(!label.projectId || label.projectId===project?.id || value.includes(label.id)) && label.name.toLowerCase().startsWith(normalized.toLowerCase())).sort((a,b)=>Number(value.includes(b.id))-Number(value.includes(a.id)));
 async function create(colour: LabelColour) {
  setBusy(true);setCreatingColour(colour);setError(null);
  try {const result=await callAction(() => createLabel({name:normalized,colour,projectId:scopeProjectId},{orgId}));
   if(result.success){catalogue.add(result.label);onChange([...new Set([...value,result.label.id])]);setStep("labels");setQuery("");toast({type:"success",title:"Label added"});}
   else setError(result.error);
  } catch (thrown) {setError(thrownMessage(thrown, "The label couldn't be created. Try again."));}
  finally {setBusy(false);setCreatingColour(null);}
 }
 return <Popover open={open} onOpenChange={next=>{if(!busy){setOpen(next);if(!next){setStep("labels");setQuery("");setError(null);}}}}>
  <PopoverTrigger asChild><Button variant="secondary" size="sm" className={pickerStyles.trigger} id="intake-request-labels" type="button" disabled={disabled} aria-label={chosen.length ? `Labels: ${chosen.map(label=>label.name).join(", ")}` : "Labels"}><LabelSelection chosen={chosen}/></Button></PopoverTrigger>
  <PopoverContent {...pickerPopoverProps} inert={open ? undefined : true} className={styles.panel} aria-label={step === "labels" ? "Labels" : step === "scope" ? "Label scope" : "Label colour"} onOpenAutoFocus={event=>{event.preventDefault();search.current?.focus();}}>
   {step === "labels" && <div className={styles.search}><SearchField ref={search} label="Search labels" hideLabel placeholder="Add labels…" value={query} maxLength={80} onValueChange={next=>{setQuery(next);setError(null);}} disabled={busy} onKeyDown={event=>{if(event.nativeEvent.isComposing)return;if(event.key==="ArrowDown"){event.preventDefault();event.currentTarget.closest('[role="dialog"]')?.querySelector<HTMLButtonElement>('[role="checkbox"]')?.focus();}}}/></div>}
   {step === "scope" ? <><p className={styles.caption}>Pick a scope for label</p><Button ref={stepFocus} type="button" size="sm" variant="ghost" className={styles.colourOption} onClick={()=>{setScopeProjectId(null);setStep("colour");}}><Building2 aria-hidden="true"/>Workspace</Button>{project ? <Button type="button" size="sm" variant="ghost" className={styles.colourOption} onClick={()=>{setScopeProjectId(project.id);setStep("colour");}}><Folder aria-hidden="true"/>{project.name}</Button> : <p className={styles.caption}>Choose a Project on the Request first to create a Project label.</p>}<Button type="button" size="sm" variant="ghost" onClick={()=>setStep("labels")}>Back</Button></> : step === "colour" ? <><p className={styles.caption}>Pick a colour for “{normalized}”</p><div className={styles.options}>{LABEL_COLOURS.map((colour,index)=><Button ref={index===0 ? stepFocus : undefined} key={colour} type="button" variant="ghost" size="sm" className={styles.colourOption} loading={creatingColour===colour} disabled={(busy && creatingColour!==colour) || !normalized || value.length>=20} onClick={()=>void create(colour)}><LabelDot colour={colour}/>{colour[0].toUpperCase()+colour.slice(1)}</Button>)}</div><Button type="button" variant="ghost" size="sm" disabled={busy} onClick={()=>setStep("scope")}>Back</Button></> : <>
    <div className={styles.options} role="group" aria-label="Available labels" onKeyDown={event=>{if(!["ArrowDown","ArrowUp","Home","End"].includes(event.key))return;const items=Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="checkbox"]'));const index=items.indexOf(event.target as HTMLButtonElement);if(index<0)return;event.preventDefault();items[event.key==="Home" ? 0 : event.key==="End" ? items.length-1 : (index+(event.key==="ArrowDown"?1:-1)+items.length)%items.length]?.focus();}}>
     {shown.map(label=><div key={label.id} className={styles.option}><label htmlFor={`${id}-${label.id}`}><LabelDot colour={label.colour}/><span className={styles.name}>{label.name}</span>{label.projectId && <span className={styles.scopeHint}>{label.projectId === project?.id ? "Project" : "Other Project, remove to save"}</span>}</label><Checkbox className={styles.checkbox} id={`${id}-${label.id}`} aria-label={label.name} checked={value.includes(label.id)} disabled={busy || (!value.includes(label.id)&&value.length>=20)} onCheckedChange={checked=>onChange(checked ? [...value,label.id] : value.filter(key=>key!==label.id))}/></div>)}
    </div>
    {catalogue.loading && <Placeholder label="Loading labels" lines={1} />}
    {catalogue.error && <><p role="alert" className={styles.error}>{catalogue.error}</p><Button type="button" size="sm" onClick={()=>{search.current?.focus();catalogue.reload();}}>Try again</Button></>}
    {!shown.length && !catalogue.loading && !catalogue.error && <p role="status" className={styles.caption}>{normalized ? "No matching labels" : catalogue.canCreate ? "No labels yet. Type a name to create one." : "No labels available."}</p>}
    {normalized && !shown.length && !catalogue.loading && catalogue.canCreate && !catalogue.error && <Button type="button" size="sm" variant="ghost" className={styles.create} disabled={value.length>=20} onClick={()=>setStep("scope")}><Plus aria-hidden="true"/>{normalized && !shown.some(label=>label.name.toLowerCase()===normalized.toLowerCase()) ? `Create new label: “${normalized}”` : "Create custom label…"}</Button>}
   </>}
   {error && <p role="alert" className={styles.error}>{error}</p>}
  </PopoverContent>
 </Popover>;
}
