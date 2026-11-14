import type { ToastStackApi } from "@/components/arc/toast-stack/toast-stack"

/** How long a change's message offers Undo: Mark Done, removing a reviewer, taking a Request out of a Same problem group. */
export const UNDO_MS = 10_000

type Copy = { title: string; description: string }

/**
 * The message after a change that can be undone: `done` with Undo for `UNDO_MS`. Undo turns the same message into
 * `undoing` while `run` works, then `undone`, or "Couldn’t undo" with the reason `run` gives `failed`. `run` resolves
 * true once the change is undone. Without `undo`, the message has no Undo.
 */
export function offerUndo({ toast, update }: Pick<ToastStackApi, "toast" | "update">, id: string, done: Copy,
  undo: { undoing: Copy; undone: Copy; run: (failed: (message: string) => void) => Promise<boolean> } | null) {
  const undoNow = async () => {
    if (!undo) return
    update(id, { type: "loading", ...undo.undoing, action: undefined })
    const back = await undo.run(message => update(id, { type: "error", title: "Couldn’t undo", description: message, action: undefined }))
    if (back) update(id, { type: "success", ...undo.undone, action: undefined })
  }
  toast({ id, type: "success", ...done, duration: UNDO_MS, action: undo ? { label: "Undo", onClick: () => { void undoNow() } } : undefined })
}
