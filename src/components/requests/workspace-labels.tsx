"use client";
import { callAction } from "@/lib/action-call";
import { createContext, useContext, useMemo, type ReactNode } from "react";
import { listLabels } from "@/app/(app)/intake/label-actions";
import { DEFAULT_LABELS, type RequestLabel } from "@/lib/request-labels";
import type { LabelCatalogue } from "@/lib/data/labels";
import { createWorkspaceCatalogue, useWorkspaceCatalogue } from "@/lib/workspace-catalogue";
type Catalogue = { labels:RequestLabel[]; canCreate:boolean; error:string|null; loading:boolean; add:(label:RequestLabel)=>void; reload:()=>void };
/** Outside the (app) layout only the default labels exist and nothing can be created. */
const Context=createContext<Catalogue>({labels:DEFAULT_LABELS,canCreate:false,error:null,loading:false,add:()=>{},reload:()=>{}});
export const useWorkspaceLabels=()=>useContext(Context);

/** The real read/add adapter consumed by the provider. */
export function createWorkspaceLabels(orgId: string, initial: LabelCatalogue) {
  return createWorkspaceCatalogue({
    initial: { entries: initial.labels, metadata: initial.canCreate },
    loadError: "Labels could not be loaded. Try again.",
    read: async () => {
      const result = await callAction(() => listLabels({ orgId }));
      return result.success ? { success: true, entries: result.labels, metadata: result.canCreate } : result;
    },
  });
}

type ProviderProps = { orgId: string; initial: LabelCatalogue; children: ReactNode };
/** The layout seeds the catalogue; a workspace switch synchronously replaces it. */
export function WorkspaceLabelsProvider(props: ProviderProps) {
 return <WorkspaceLabelsCatalogue key={props.orgId} {...props} />;
}
function WorkspaceLabelsCatalogue({orgId,initial,children}: ProviderProps) {
 const state = useWorkspaceCatalogue(() => createWorkspaceLabels(orgId, initial));
 const value = useMemo(() => ({ labels: state.entries, canCreate: state.metadata, loading: state.loading, error: state.error, add: state.add, reload: state.reload }), [state]);
 return <Context.Provider value={value}>{children}</Context.Provider>;
}
