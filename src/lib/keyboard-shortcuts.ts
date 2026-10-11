/**
 * Plan item 2.4 (decisions 8.24 and 8.25): every keyboard shortcut Lane
 * supports, in one map. The `?` overlay renders from it, and a unit test keeps
 * it free of clashes. Handlers own registration; this map only describes them.
 */
export type ShortcutScope = "anywhere" | "list" | "detail" | "forms"

export type Shortcut = {
  /** The keys as shown, one entry per alternative ("J" or "↓"); a chord is one string ("Shift F10"). */
  keys: string[]
  label: string
}

export type ShortcutGroup = { scope: ShortcutScope; title: string; shortcuts: Shortcut[] }

export const SHORTCUT_GROUPS: ShortcutGroup[] = [
  { scope: "anywhere", title: "Anywhere", shortcuts: [
    { keys: ["C"], label: "New Request" },
    { keys: ["/"], label: "Search workspace" },
    { keys: ["["], label: "Show or hide sidebar" },
    { keys: ["?"], label: "Show or hide keyboard shortcuts" },
    { keys: ["Alt T"], label: "Go to messages, such as Undo" },
  ] },
  { scope: "list", title: "Requests list", shortcuts: [
    { keys: ["J", "↓"], label: "Next row" },
    { keys: ["K", "↑"], label: "Previous row" },
    { keys: ["Home", "End"], label: "First or last row on the page" },
    { keys: ["→"], label: "Expand a group, then go to its first Request" },
    { keys: ["←"], label: "Collapse a group, or go to the Request's group" },
    { keys: ["Enter"], label: "Open the Request, or show or hide the group" },
    { keys: ["X"], label: "Select or deselect the Request" },
    { keys: ["Esc"], label: "Clear the selection" },
    { keys: ["F"], label: "Add a filter" },
    { keys: ["Shift F10"], label: "Request actions" },
  ] },
  { scope: "detail", title: "Request detail", shortcuts: [
    { keys: ["Esc"], label: "Back to Requests" },
  ] },
  { scope: "forms", title: "Forms", shortcuts: [
    { keys: ["⌘ Enter", "Ctrl Enter"], label: "Submit" },
  ] },
]

/** The hints the row menu shows. Only actions the menu itself can run carry one. */
export const ROW_MENU_HINTS = { select: "X", open: "Enter" } as const
