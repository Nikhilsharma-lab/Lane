"use client";

import dynamic from "next/dynamic";
import { Placeholder } from "@/components/loading/placeholder";

/**
 * #210: every Settings page carries the Members section, so its controls (and Clerk's member list) load after the
 * page instead of in its first load, as the Quarter note editor does on Impact (#209).
 */
export const WorkspaceMembersLoader = dynamic(() => import("./workspace-members").then(module => module.WorkspaceMembers), {
  loading: () => <Placeholder label="Loading people…" lines={3} />,
});
