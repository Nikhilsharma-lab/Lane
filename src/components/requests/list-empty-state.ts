import type { RequestStatusFilter } from "@/lib/request-workspace"
import { hasAddedFilters, type FilterView } from "./added-filters"

/*
 * #240 decision 8 (A224): what the Requests list says when it has nothing to show. Pure, so the list and its tests
 * read the same rules. Which filters were added (A215) is added-filters.ts.
 */

type ListView = FilterView & { status: RequestStatusFilter }

export type ListEmptyLine =
  | { kind: "welcome" }
  | { kind: "status" | "filtered" | "empty"; title: string; description: string; newRequest: boolean; clearFilters: boolean }

/** Each status pill's own line: a heading and, where the line has one, its second sentence. */
const PILL_LINES: Record<Exclude<RequestStatusFilter, "all">, [string, string]> = {
  open: ["Nothing is Open", "New Requests start here."],
  in_progress: ["Nothing is In progress", "Requests move here when someone picks them up."],
  done: ["Nothing is Done", "Requests move here when the work is finished."],
  measuring: ["Nothing is Measuring", "Requests move here once their work is released."],
  closed: ["Nothing is Closed yet", "Requests close when the result is recorded."],
  due: ["No results are due soon", ""],
  waiting: ["No Guest submissions are waiting", ""],
}

/**
 * In this order: the empty workspace's welcome; a status pill's own line when only a pill narrows the list (on a
 * Project page too), with New Request on Open's for anyone who can file; otherwise the generic line, whose Clear
 * filters clears only what was added.
 */
export function listEmptyLine(view: ListView, { workspaceEmpty, readOnly }: { workspaceEmpty: boolean; readOnly: boolean }): ListEmptyLine {
  if (workspaceEmpty) return { kind: "welcome" }
  if (hasAddedFilters(view)) return { kind: "filtered", title: "No matching Requests", description: "Change or clear your filters.", newRequest: false, clearFilters: true }
  if (view.status !== "all") {
    const [title, description] = PILL_LINES[view.status]
    return { kind: "status", title, description, newRequest: view.status === "open" && !readOnly, clearFilters: false }
  }
  const title = view.project === "none" ? "No Requests without a Project" : view.project !== "all" ? "No Requests in this Project yet" : "No Requests yet"
  return { kind: "empty", title, description: "Create a Request to get started.", newRequest: false, clearFilters: false }
}
