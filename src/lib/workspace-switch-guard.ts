export const WORKSPACE_SWITCH_EVENT = "lane:before-workspace-switch";

/** Check before Clerk changes tenancy. Synthetic events never open a browser prompt. */
export function assertWorkspaceCanSwitch(target: Pick<EventTarget, "dispatchEvent"> = window): void {
  const allowed = target.dispatchEvent(new Event(WORKSPACE_SWITCH_EVENT, { cancelable: true }))
    && target.dispatchEvent(new Event("beforeunload", { cancelable: true }));
  if (!allowed) {
    throw new Error("Finish your Request before switching workspaces to avoid losing unsaved changes or files.");
  }
}
