"use client"

import dynamic from "next/dynamic"
import { Placeholder } from "@/components/loading/placeholder"
import { SettingsBlock } from "./settings-group"

/**
 * #395: every Settings page carries Workspace details, so its rows' code loads after the page instead of in its first
 * load, as Profile's account does (#394). The server still draws the rows with the page.
 */
const loading = () => <SettingsBlock><Placeholder label="Loading workspace…" lines={1} /></SettingsBlock>

export const WorkspaceNameLoader = dynamic(() => import("./workspace-rows").then((module) => module.WorkspaceName), { loading })
export const LeaveWorkspaceLoader = dynamic(() => import("./workspace-rows").then((module) => module.LeaveWorkspace), { loading })
