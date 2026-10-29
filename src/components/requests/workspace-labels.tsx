"use client";
import { callAction } from "@/lib/action-call";
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { listLabels } from "@/app/(app)/intake/label-actions";
import { DEFAULT_LABELS, type RequestLabel } from "@/lib/request-labels";
import type { LabelCatalogue } from "@/lib/data/labels";
type Catalogue = { labels:RequestLabel[]; canCreate:boolean; error:string|null; loading:boolean; add:(label:RequestLabel)=>void; reload:()=>void };
/** Outside the (app) layout only the default labels exist and nothing can be created. */
const Context=createContext<Catalogue>({labels:DEFAULT_LABELS,canCreate:false,error:null,loading:false,add:()=>{},reload:()=>{}});
export const useWorkspaceLabels=()=>useContext(Context);
/** The layout reads the catalogue with the page (loadLabels), so nothing is fetched on load; `reload` refreshes it after a failure. */
export function WorkspaceLabelsProvider({orgId,initial,children}:{orgId:string;initial:LabelCatalogue;children:ReactNode}) {
 const [catalogue,setCatalogue]=useState(initial);
 const [loading,setLoading]=useState(false),[error,setError]=useState<string|null>(null);
 const reload=useCallback(()=>{
  setLoading(true);
  void callAction(() => listLabels({orgId})).then(result=>{
   if(result.success){setCatalogue({labels:result.labels,canCreate:result.canCreate});setError(null);}
   else setError(result.error);
  },()=>setError("Labels couldn't be loaded. Try again.")).finally(()=>setLoading(false));
 },[orgId]);
 const add=useCallback((label:RequestLabel)=>setCatalogue(current=>({...current,labels:[...current.labels.filter(item=>item.id!==label.id),label]})),[]);
 const value=useMemo(()=>({...catalogue,loading,error,add,reload}),[catalogue,loading,error,add,reload]);
 return <Context.Provider value={value}>{children}</Context.Provider>;
}
