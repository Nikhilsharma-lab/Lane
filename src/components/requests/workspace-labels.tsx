"use client";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { listLabels } from "@/app/(app)/intake/label-actions";
import { DEFAULT_LABELS, type RequestLabel } from "@/lib/request-labels";
type Catalogue = { labels:RequestLabel[]; canCreate:boolean; error:string|null; loading:boolean; add:(label:RequestLabel)=>void; reload:()=>void };
const Context=createContext<Catalogue>({labels:DEFAULT_LABELS,canCreate:true,error:null,loading:false,add:()=>{},reload:()=>{}});
export const useWorkspaceLabels=()=>useContext(Context);
export function WorkspaceLabelsProvider({orgId,children,initialLabels}:{orgId:string;children:ReactNode;initialLabels?:RequestLabel[]}) {
 const [labels,setLabels]=useState(initialLabels ?? DEFAULT_LABELS);
 const [loading,setLoading]=useState(!initialLabels),[error,setError]=useState<string|null>(null),[canCreate,setCanCreate]=useState(false),[revision,setRevision]=useState(0);
 useEffect(()=>{
  if(initialLabels && revision===0) return;
  let cancelled=false;
  void listLabels({orgId}).then(result=>{
   if(cancelled)return;
   if(result.success){setLabels(result.labels);setCanCreate(result.canCreate);setError(null);}
   else setError(result.error);
   setLoading(false);
  }).catch(()=>{if(!cancelled){setError("Labels could not be loaded. Try again.");setLoading(false);}});
  return()=>{cancelled=true;};
 },[orgId,revision,initialLabels]);
 return <Context.Provider value={{labels,loading,error,canCreate:initialLabels ? true : canCreate,add:label=>setLabels(current=>[...current.filter(item=>item.id!==label.id),label]),reload:()=>{setLoading(true);setRevision(value=>value+1);}}}>{children}</Context.Provider>;
}
