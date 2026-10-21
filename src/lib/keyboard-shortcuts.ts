/**
 * Plan item 2.4 (decisions 8.24 and 8.25): every keyboard shortcut Lane
 * supports, in one map. The `?` overlay renders from it, and a unit test keeps
 * it free of clashes. Handlers own registration; this map only describes them.
 */
export type ShortcutScope = "anywhere" | "list" | "preview" | "detail" | "notifications" | "forms"

export type Shortcut = {
  /** The keys as shown, one entry per interchangeable alternative ("J" or "↓"); a chord is one string ("Shift F10"). Keys that do different things get their own entries. */
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
    // The toast region's name is "Messages (Alt+T)" (src/app/layout.tsx), apart from the sidebar's Notifications inbox.
    { keys: ["Alt T"], label: "Go to messages, such as Undo" },
  ] },
  { scope: "list", title: "Requests list", shortcuts: [
    { keys: ["J", "↓"], label: "Next row" },
    { keys: ["K", "↑"], label: "Previous row" },
    { keys: ["Home"], label: "First row on the page" },
    { keys: ["End"], label: "Last row on the page" },
    { keys: ["→"], label: "Expand a group, then go to its first Request" },
    { keys: ["←"], label: "Collapse a group, or go to the Request's group" },
    { keys: ["Enter"], label: "Open the Request, or show or hide the group" },
    { keys: ["Space"], label: "Preview the Request beside the list" },
    { keys: ["X"], label: "Select or deselect the Request" },
    { keys: ["Esc"], label: "Clear the selection" },
    { keys: ["F"], label: "Add a filter" },
    { keys: ["Shift F10"], label: "Request actions" },
  ] },
  // Plan item 2.12: the preview follows the list's focus (J and K above); Enter on the row still opens the page.
  { scope: "preview", title: "Request preview", shortcuts: [
    { keys: ["Esc"], label: "Close the preview, back to its row" },
  ] },
  // Plan item 2.5 (decision D1): the arrows move between Requests only from the previous and next buttons.
  { scope: "detail", title: "Request detail", shortcuts: [
    { keys: ["J"], label: "Next Request" },
    { keys: ["K"], label: "Previous Request" },
    { keys: ["Esc"], label: "Close a form or menu, then back to Requests" },
  ] },
  // Plan item 2.7 (decision 8.10): inside the open notifications popover. Enter is the row's own activation; Esc is the popover's.
  { scope: "notifications", title: "Notifications", shortcuts: [
    { keys: ["J", "↓"], label: "Next notification" },
    { keys: ["K", "↑"], label: "Previous notification" },
    { keys: ["Home"], label: "First notification" },
    { keys: ["End"], label: "Last notification" },
    { keys: ["Enter"], label: "Open the Request" },
    { keys: ["Esc"], label: "Close notifications" },
  ] },
  { scope: "forms", title: "Forms", shortcuts: [
    { keys: ["⌘ Enter", "Ctrl Enter"], label: "Submit" },
  ] },
]

/** The hints the row menu shows. Only actions the menu itself can run carry one. */
export const ROW_MENU_HINTS = { select: "X", open: "Enter", peek: "Space" } as const
